const express = require('express');
const app = express();
// const connectDB = require("./config/db");

const User = require('./models/User');
const Message = require('./models/Message');
const userRoutes = require('./routes/userRoutes.js')
const rooms = ['general', 'tech', 'finance', 'crypto'];
const cors = require('cors');
require("dotenv").config();

app.use(express.urlencoded({extended: true}));
app.use(express.json());
app.use(cors());
app.use('/users', userRoutes)
const path = require("path");
const mongoose = require('mongoose');

// --------------------------deployment------------------------------

const __dirname1 = path.resolve();

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname1, "/frontend/build")));

  app.get("*", (req, res) =>
    res.sendFile(path.resolve(__dirname1, "frontend", "build", "index.html"))
  );
} else {
  
  app.get("/", (req, res) => {
    res.send("API is running..");
  });
}

// --------------------------deployment------------------------------

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.DB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("ok");
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1); // Exit with a non-zero status code to indicate an error
  }
};

connectDB()



const server = require('http').createServer(app);
const PORT = 5001;
const io = require('socket.io')(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
})

app.get('/rooms', (req, res)=> {
  res.json(rooms)
})


//日付ごとにメッセージをグループ化
async function getLastMessagesFromRoom(room){
  let roomMessages = await Message.aggregate([
    {$match: {to: room}},
    {$group: {_id: '$date', messagesByDate: {$push: '$$ROOT'}}}
  ])
  return roomMessages;
}
//並べ替え(idは日付（インデックス）)
//02/11/2022を20221102にしたい
function sortRoomMessagesByDate(messages){
  return messages.sort(function(a, b){
    let date1 = a._id.split('/');
    let date2 = b._id.split('/');

    date1 = date1[2] + date1[0] + date1[1]
    date2 =  date2[2] + date2[0] + date2[1];

    return date1 < date2 ? -1 : 1
  })
}

// socket connection
io.on('connection', (socket)=> {

  socket.on('new-user', async ()=> {
    const members = await User.find();
    io.emit('new-user', members)
  })

  socket.on('join-room', async(room)=> {
    socket.join(room);
    
    let roomMessages = await getLastMessagesFromRoom(room);
    roomMessages = sortRoomMessagesByDate(roomMessages);
    socket.emit('room-messages', roomMessages)
  })

  socket.on('message-room', async(room, content, sender, time, date) => {
    console.log('new message', content);
    const newMessage = await Message.create({content, from: sender, time, date, to: room});
    let roomMessages = await getLastMessagesFromRoom(room);
    roomMessages = sortRoomMessagesByDate(roomMessages);
    // sending message to room
    io.to(room).emit('room-messages', roomMessages);
    socket.broadcast.emit('notifications', room)
  })

  app.delete('/logout', async(req, res)=> {
    try {
      const {_id, newMessages} = req.body;
      const user = await User.findById(_id);
      user.status = "offline";
      user.newMessages = newMessages;
      await user.save();
      const members = await User.find();
      socket.broadcast.emit('new-user', members);
      res.status(200).send();
    } catch (e) {
      console.log(e);
      res.status(400).send()
    }
  })
})



server.listen(PORT, ()=> {
  console.log('listening to port', PORT)
})
