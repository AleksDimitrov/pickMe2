const { Console } = require('console');
const e = require('express');
const express = require('express')
const app = express()
const http = require('http');
const server = http.createServer(app);
const io = require("socket.io")(server, {
    cors: {
        origin: '*',
    }
});

const port = 3000

app.set("view engine", "ejs");
app.use(express.static(__dirname + "/public"));

app.get("/", (req, res) => {
    console.log(req.query);
    res.render("menu");
});

app.get("/create", (req, res) => {
    res.render("create");
});

app.get("/:newRoom", (req, res) => {
    let newRoomName = req.params.newRoom;
    let username = req.query.value;
    console.log(req.query);
    res.render("home", {"room":newRoomName, "username": username});
});

// var holdAnswers = {}; // Dictionary of counter of votes on each box
// var voters = [];
var roomsData = {};
var roomsWait = {};
var usernames = {};
var userRooms = {};

function emptyChoices(room) {

    roomsData[room]["holdAnswers"] = {}

}

function emptyChoicesWait(room) {

    roomsWait[room]["holdAnswers"] = {}
    // Started index at 1, because element id's start at at button1.
}


// Takes in a dictionary and a list representing the keys with highest value.
// If there is a key with the highest value, an array of size 1 will be returned.
// We loop through dictionary, if value == highest, push key, if value > highest restart picking.
function getWinner(currAnswers) {
    let highest = 0;
    let winners = [];
    for (const [key, value] of Object.entries(currAnswers)) {
        if (value > highest) {
            winners = [];
            highest = value;
            winners.push(key);
        } else if (value == highest) {
            winners.push(key);
        }
    }
    return winners;
}

function initializeRoom(room, admin) {
    roomInfo = {"counter": 0, "voters": [], "boxes":2, "holdAnswers":{}, "gameTime": 10, "admin": admin, "prompt": null, "options":[], "roundResults": {}, "round": 0, "roundReady":false};
    roomInfo["roundTime"] = Math.floor(roomInfo["gameTime"]*1.5);
    roomsWait[room] = roomInfo;
    //roomsData[room] = roomInfo;
}

function checkRoomRemoval(room) {
    delete roomsData[room];
    delete roomsWait[room];
}

io.on('connection', (socket) => {
    socket.on('create', function(msg) {

        console.log("UserJoinedAt" + " " + msg.room);
        console.log("current rooms after cn", socket.rooms); // the Set contains at least the socket ID
        var clients = io.sockets.adapter.rooms.get(msg.room);
        var numClients = clients ? clients.size : 0;
        
        // 0 Users connected to room, therefore room is empty.
        if (numClients == 0) {
            initializeRoom(msg.room);
            console.log(roomsData[msg.room]);
            emptyChoicesWait(msg.room);
            io.to(socket.id).emit("admin panel", {"room": msg.room});
        }

        let exists = Object.values(usernames).includes(msg.username);
        if (!exists) {
            usernames[socket.id] = msg.username;
        }
        userRooms[socket.id] = msg.room;

        console.log(usernames);


        socket.join(msg.room);

        //Update numClients and send to all
        //We add one to the previous amount of clients
        numClients+=1
        socket.nsp.to(msg.room).emit("user count", {"userCount":numClients});
    });

    socket.on('start game', function(msg){
        console.log("Starting ! :" + msg.prompt)
        roomsWait[msg.room]["prompt"] = msg.prompt;
        roomsWait[msg.room]["options"] = msg.options;
        roomsData[msg.room] = roomsWait[msg.room] 

        var roundOptions = roomsData[msg.room]["options"].splice(0,2);
        roomsData[msg.room]["holdAnswers"][roundOptions[0]] = 0;
        roomsData[msg.room]["holdAnswers"][roundOptions[1]] = 0;
        roomsData[msg.room]["roundReady"] = true;

        socket.nsp.to(msg.room).emit('set board', { 'answers': roomsData[msg.room]["holdAnswers"], "prompt": roomsData[msg.room]["prompt"], "roundOptions": roundOptions});
        delete roomsWait[msg.room];
    })

    socket.on("disconnecting", () => {
        console.log("current rooms after dcing", socket.rooms); // the Set contains at least the socket ID
        
        var roomName = userRooms[socket.id];
        var clients = io.sockets.adapter.rooms.get(roomName);
        var numClients = clients ? clients.size : 0;
        socket.nsp.to(roomName).emit("user count", {"userCount":numClients-1});
        delete userRooms[socket.id];

        checkRoomRemoval(); 
    });

    console.log('a user connected');
    socket.on('button click', (msg) => {
        //Voters reinforces one vote per socketid. If socket id has been recorded, then that id has voted.
        if (!roomsData[msg["roomCode"]]["voters"].includes(socket.id)) {
            roomsData[msg["roomCode"]]["voters"].push(socket.id);
            roomsData[msg["roomCode"]]["holdAnswers"][msg.id]++;
            console.log(roomsData[msg["roomCode"]]["holdAnswers"]);
        }
    });

    socket.on('sent message', (msg) => {
        console.log("SENDING TO: " + msg.roomCode);
        socket.nsp.to(msg.roomCode).emit("recieve message", usernames[socket.id] + ": " + msg.text);
    });


    setInterval(() => {
        for (key in roomsData) {
            if (roomsData[key]["counter"] < roomsData[key]["gameTime"]) {
                socket.nsp.to(key).emit('counter', (roomsData[key]["gameTime"]-roomsData[key]["counter"]) + " seconds left");
            }  else {
                socket.nsp.to(key).emit('counter', "restarting in " + (roomsData[key]["roundTime"]-roomsData[key]["counter"]) + " ");
            }
            //Round ends 1 second after playtime.
            if (roomsData[key]["counter"] == roomsData[key]["gameTime"]+1) {
                //winningKey is a reduce function that determines key with highest value.
                // !TODO Winner determiner only supports two options.
                let winners = getWinner(roomsData[key]["holdAnswers"]);
                socket.nsp.to(key).emit('button msg', { 'answers': roomsData[key]["holdAnswers"], 'winner': winners});
                roomsData[key]["roundReady"] = false;
            // Answers are cleared 2 seconds before gametime ends.
            } else if (roomsData[key]["counter"] == roomsData[key]["roundTime"]) {
                // socket.nsp.to(key).emit('reset msg', { 'answers': roomsData[key]["holdAnswers"]});

                if (roomsData[key]["options"].length <= 1 && roomsData[key]["roundReady"] == false) {
                    console.log("GAME ENDED!!");
                    socket.nsp.to(key).emit('end game', {});
                    roomsWait[key] = roomsData[key];
                    delete roomsData[key];
                } else if (roomsData[key]["options"].length > 1 && roomsData[key]["roundReady"] == false) {
                    emptyChoices(key);
                    var roundOptions = roomsData[key]["options"].splice(0,2);
                    console.log(roundOptions[0]);
                    console.log(roundOptions[1]);
                    roomsData[key]["holdAnswers"][roundOptions[0]] = 0;
                    roomsData[key]["holdAnswers"][roundOptions[1]] = 0;
                    roomsData[key]["roundReady"] = true;
            
                    socket.nsp.to(key).emit('set board', { 'answers': roomsData[key]["holdAnswers"], "prompt": roomsData[key]["prompt"], "roundOptions": roundOptions});

                    // socket.nsp.to(key).emit('set board', { 'answers': roomsData[key]["holdAnswers"]});
                    roomsData[key]["voters"] = [];
                } else {
                    // DO NOTHING
                }
            }
        }
    }, 500);
});

// var gameTime = 10;
// var roundTime = Math.floor(gameTime*1.5);
// var counter = 0;
setInterval(() => {
    for (key in roomsData) {
        //console.log("RUNNING", key, roomsData[key]["counter"], "->", roomsData[key]["roundTime"]);
        // (gameTime*1.5) indicates full round time. gameTime is playTime, 1.5* represents results time as well.
        if (roomsData[key]["counter"] < roomsData[key]["roundTime"]) { 
            roomsData[key]["counter"] = roomsData[key]["counter"]+1;
        } else {
            roomsData[key]["counter"] = 0;
        }
    }
}, 1000);

server.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
})
