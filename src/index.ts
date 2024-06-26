#!/usr/bin/env node
// const WebSocketServer = require('websocket').server;
import { server as WebSocketServer, connection } from 'websocket'
import { OutgoingMessage, SupportedMessage as OutgoingSupportedMessage } from './messages/outgoingMessages.js';
// const http = require('http');
import http from 'http'
import { IncomingMessage, SupportedMessage } from './messages/incomingMessages.js';
import { UserManager } from './UserManager';
import { InMemoryStore } from './store/InMemoryStore';
const userManager = new UserManager()
const store = new InMemoryStore()
const server = http.createServer(function (request: any, response: any) {
    console.log((new Date()) + ' Received request for ' + request.url);
    response.writeHead(200);
    response.end();
});
server.listen(8090, function () {
    console.log((new Date()) + ' Server is listening on port 8090');
});

const wsServer = new WebSocketServer({
    httpServer: server,
    // You should not use autoAcceptConnections for production
    // applications, as it defeats all standard cross-origin protection
    // facilities built into the protocol and the browser.  You should
    // *always* verify the connection's origin and decide whether or not
    // to accept it.
    autoAcceptConnections: true
});

function originIsAllowed(origin: any) {
    // put logic here to detect whether the specified origin is allowed.
    return true;
}

wsServer.on('request', function (request) {
    if (!originIsAllowed(request.origin)) {
        // Make sure we only accept requests from an allowed origin
        request.reject();
        console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.');
        return;
    }

    const connection = request.accept('echo-protocol', request.origin);
    console.log((new Date()) + ' Connection accepted.');
    connection.on('message', function (message) {
        if (message.type === 'utf8') {
            // console.log('Received Message: ' + message.utf8Data);
            // connection.sendUTF(message.utf8Data);
            messageHandler(connection,JSON.parse(message.utf8Data))
        }
        else if (message.type === 'binary') {
            console.log('Received Binary Message of ' + message.binaryData.length + ' bytes');
            connection.sendBytes(message.binaryData);
        }
    });
    connection.on('close', function (reasonCode, description) {
        console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
    });
});

function messageHandler(ws: connection, message: IncomingMessage) {
    if (message.type === SupportedMessage.JoinRoom) {
        userManager.addUser(message.payload.name, message.payload.userId, message.payload.roomId, ws)
    }
    if (message.type === SupportedMessage.SendMessage) {
        const payload = message.payload;
        const user = userManager.getUser(payload.roomId, payload.userId);
        if (!user) {
            console.error(payload.userId, "User not found in DB")
            return
        }
        const chat = store.addChat(payload.userId, payload.roomId, user.name, payload.message)
        if(!chat){
            return
        }

        const outgoingPayload: OutgoingMessage = {
            type: OutgoingSupportedMessage.AddChat,
            payload: {
                    chatId:chat.id,
                    roomId: payload.roomId,
                    message: payload.message,
                    name: user.name,
                    upvotes: 0

            }
        }
        userManager.broadcast(payload.roomId,payload.userId, outgoingPayload)
    }

    if (message.type === SupportedMessage.UpvoteMessage) {
        const chat = store.upVote(message.payload.userId, message.payload.roomId, message.payload.chatId)
        if(!chat) return;

        const outgoingPayload: OutgoingMessage = {
            type: OutgoingSupportedMessage.UpdateChat,
            payload: {
                    chatId:chat.id,
                    roomId: message.payload.roomId, 
                    upvotes: chat.upvotes.length

            }
            
        }
        userManager.broadcast(message.payload.roomId,message.payload.userId, outgoingPayload)

    }


}