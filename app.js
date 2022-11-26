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

app.get("/:newRoom", (req, res) => {
    let newRoomName = req.params.newRoom;
    let username = req.query.value;
    console.log(req.query);
    res.render("home", {"room":newRoomName, "username": username});
});

// var holdAnswers = {}; // Dictionary of counter of votes on each box
// var voters = [];
var roomsData = {};
var usernames = {};

function emptyChoices(room) {

    roomsData[room]["holdAnswers"] = {}
    // Started index at 1, because element id's start at at button1.
    let roomBoxes = roomsData[room]["boxes"];
    for (let box = 1; box <= roomBoxes; box++){
        roomsData[room]["holdAnswers"]["button" + box] = 0;
    }
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

function initializeRoom(room) {
    roomInfo = {"counter": 0, "voters": [], "boxes":2, "holdAnswers":{}, "gameTime": 10};
    roomInfo["roundTime"] = Math.floor(roomInfo["gameTime"]*1.5);
    roomsData[room] = roomInfo;
}

function checkRoomRemoval(room) {
    delete roomsData[room];
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
            emptyChoices(msg.room);
        }

        let exists = Object.values(usernames).includes(msg.username);
        if (!exists) {
            usernames[socket.id] = msg.username;
        }
        console.log(usernames);


        socket.join(msg.room);
    });

    socket.on("disconnecting", () => {
        console.log("current rooms after dcing", socket.rooms); // the Set contains at least the socket ID
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
            // Answers are cleared 2 seconds before gametime ends.
            } else if (roomsData[key]["counter"] == roomsData[key]["roundTime"]) {
                socket.nsp.to(key).emit('reset msg', { 'answers': roomsData[key]["holdAnswers"]});
                emptyChoices(key);
                roomsData[key]["voters"] = [];
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
