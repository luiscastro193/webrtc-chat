"use strict";
const createButton = document.getElementById('create-button');
const joinButton = document.getElementById('join-button');
const nameForm = document.getElementById('name-form');
const roomForm = document.getElementById('room-form');
const info = document.getElementById('info');
const messages = document.getElementById('messages');
const messageForm = document.getElementById('message-form');

const hostChannels = new Map();
let myChannel;
let myName;

function setName() {
	return new Promise(resolve => {
		nameForm.onsubmit = event => {
			event.preventDefault();
			nameForm.hidden = true;
			myName = nameForm.elements['name'].value;
			resolve();
		};
		
		nameForm.hidden = false;
	});
}

function getCode() {
	return new Promise(resolve => {
		roomForm.onsubmit = event => {
			event.preventDefault();
			roomForm.hidden = true;
			resolve(roomForm.elements['code'].value);
		};
		
		roomForm.hidden = false;
	});
}

function addMessage(msg) {
	for (let channel of hostChannels.values())
		channel.send(msg);
	
	let li = document.createElement("li");
	li.textContent = msg;
	messages.appendChild(li);
	messageForm.scrollIntoView();
}

function sendMessage(msg) {
	if (myChannel)
		myChannel.send(msg);
	else
		addMessage(`${myName}: ${msg}`);
}

function enableMessages() {
	messageForm.onsubmit = event => {
		event.preventDefault();
		sendMessage(messageForm.elements['message'].value);
		messageForm.elements['message'].value = '';
	}
	
	messageForm.hidden = false;
}

async function setAsHost() {
	createButton.disabled = true;
	joinButton.disabled = true;
	
	await setName();
	
	const code = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
	info.textContent = `Hosting room ${code}`;
	
	enableMessages();
	
	while (true) { try {
		let [user, channel] = await host(code);
		
		let oldChannel = hostChannels.get(user);
		
		if (oldChannel) {
			oldChannel.close();
			await new Promise(resolve => setTimeout(resolve, 0));
		}
			
		addMessage(`${user} has connected`);
		hostChannels.set(user, channel);
		
		channel.addEventListener('message', event => addMessage(`${user}: ${event.data}`));
		
		channel.addEventListener('close', () => {
			hostChannels.delete(user);
			addMessage(`${user} has disconnected`);
		});
	} catch (e) {}}
}

async function connectToRoom() {
	createButton.disabled = true;
	joinButton.disabled = true;
	
	const code = await getCode();
	await setName();
	info.textContent = `Connecting to room ${code}...`;
	try {
		myChannel = await connect(code, myName);
	}
	catch (e) {
		info.textContent = `Connection to room ${code} failed`;
		throw e;
	}
	myChannel.addEventListener('message', event => addMessage(event.data));
	info.textContent = `Connected to room ${code}`;
	
	myChannel.addEventListener('close', () => {
		let msg = `Host has disconnected. Chat ended.`;
		addMessage(msg);
		info.textContent = msg;
	});
		
	enableMessages();
}

createButton.onclick = setAsHost;
joinButton.onclick = connectToRoom;
createButton.disabled = false;
joinButton.disabled = false;
