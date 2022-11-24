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
app.use(express.static("public"));

app.get('/', (req, res) => {
    const newRoomName = "default".toUpperCase();
    res.render("home", {"room":newRoomName});
})

app.get('/:newRoom', (req, res) => {
    res.render("home", )
})

var holdAnswers = {}; // Dictionary of counter of votes on each box
var voters = [];
var boxes = 2;

function resetAnswers() {
    holdAnswers = {};
    // Started index at 1, because element id's start at at button1.
    for (let box = 1; box <= boxes; box++){
         holdAnswers["button" + box] = 0;
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

resetAnswers();

io.on('connection', (socket) => {
    console.log('a user connected');
    socket.on('button click', (msg) => {
        console.log(holdAnswers);
        if (!voters.includes(socket.id)) {
            voters.push(socket.id);
            holdAnswers[msg.id]++;
        }
    });

    socket.on('sent message', (msg) => {
        socket.emit("recieve message", msg);
    });


    setInterval(() => {
        if (counter < gameTime) {
            socket.emit('counter', counter);
        }  else {
            socket.emit('counter', "restarting in " + (roundTime-counter) + " ");
        }
        //Round ends 1 second after playtime.
        if (counter == gameTime+1) {
            //winningKey is a reduce function that determines key with highest value.
            // !TODO Winner determiner only supports two options.
            let winners = getWinner(holdAnswers);
            io.emit('button msg', { 'answers': holdAnswers, 'winner': winners});
        // Answers are cleared 2 seconds before gametime ends.
        } else if (counter == roundTime) {
            io.emit('reset msg', { 'answers': holdAnswers});
            resetAnswers();
            voters = [];
        }
    }, 500);
});

var gameTime = 10;
var roundTime = Math.floor(gameTime*1.5);
var counter = 0;
setInterval(() => {
    // (gameTime*1.5) indicates full round time. gameTime is playTime, 1.5* represents results time as well.
    if (counter < roundTime) { 
        counter++;
    } else {
        counter = 0;
    }
}, 1000);

server.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
})
