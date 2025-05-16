"use strict";
import {Host, connect} from './webrtc.js';

const createButton = document.getElementById('create-button');
const joinButton = document.getElementById('join-button');
const nameForm = document.getElementById('name-form');
const roomForm = document.getElementById('room-form');
const info = document.getElementById('info');
const shareButton = document.getElementById('share-button');
const qrButton = document.getElementById('qr-button');
const cancelButton = document.getElementById('cancel-button');
const messages = document.getElementById('messages');
const messageForm = document.getElementById('message-form');
const dialog = document.querySelector('dialog');
const dialogMsg = dialog.querySelector('p');

const hostChannels = new Map();
let myChannel;
let code;
let myName;

let modalPromise = Promise.resolve();

async function showModal(message) {
	return modalPromise = modalPromise.then(() => new Promise(resolve => {
		dialogMsg.textContent = message;
		dialog.addEventListener('close', resolve, {once: true});
		dialog.showModal();
	}));
}

function setName() {
	return new Promise(resolve => {
		nameForm.onsubmit = event => {
			event.preventDefault();
			nameForm.hidden = true;
			myName = nameForm.elements['name'].value;
			resolve();
		};
		
		nameForm.hidden = false;
		nameForm.elements['name'].focus();
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
		roomForm.elements['code'].focus();
	});
}

function addMessage(msg) {
	for (let channel of hostChannels.values())
		channel.send(msg);
	
	let li = document.createElement("li");
	li.textContent = msg;
	messages.appendChild(li);
	messageForm.scrollIntoView(false);
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
	messageForm.elements['message'].focus();
}

function connectURL() {
	return new URL('#' + code, location.href);
}

shareButton.onclick = () => {
	let url = connectURL();
	
	if (navigator.share)
		navigator.share({url});
	else
		navigator.clipboard.writeText(url).then(() => showModal("Link copied to clipboard"));
};

qrButton.onclick = () => {
	let url = "https://luiscastro193.github.io/qr-generator/#" + encodeURIComponent(connectURL());
	window.open(url);
}

cancelButton.onclick = () => location.reload();

async function setAsHost() {
	createButton.disabled = true;
	joinButton.disabled = true;
	
	await setName();
	
	code = Math.trunc(Math.random() * 10000).toString().padStart(4, '0');
	info.textContent = `Hosting room ${code}`;
	shareButton.hidden = false;
	qrButton.hidden = false;
	
	enableMessages();
	const host = new Host(code);
	
	while (true) {
		let [user, channel] = await host.nextChannel();
		
		if (user == myName)
			user += " 2";
		
		let oldChannel = hostChannels.get(user);
		
		if (oldChannel) {
			oldChannel.close();
			await new Promise(resolve => setTimeout(resolve));
		}
			
		addMessage(`${user} has connected`);
		hostChannels.set(user, channel);
		channel.addEventListener('message', event => addMessage(`${user}: ${event.data}`));
		
		channel.addEventListener('close', () => {
			hostChannels.delete(user);
			addMessage(`${user} has disconnected`);
		});
	}
}

async function connectToRoom() {
	createButton.disabled = true;
	joinButton.disabled = true;
	
	if (!code) code = await getCode();
	await setName();
	info.textContent = `Connecting to room ${code}...`;
	cancelButton.hidden = false;
	
	try {
		myChannel = await connect(code, myName);
	}
	catch (e) {
		info.textContent = `Connection to room ${code} failed`;
		throw e;
	}
	myChannel.addEventListener('message', event => addMessage(event.data));
	info.textContent = `Connected to room ${code}`;
	cancelButton.hidden = true;
	
	myChannel.addEventListener('close', () => {
		let msg = `Host has disconnected. Chat ended.`;
		addMessage(msg);
		info.textContent = msg;
		messageForm.elements['send'].disabled = true;
	});
		
	enableMessages();
}

createButton.onclick = setAsHost;
joinButton.onclick = connectToRoom;
createButton.disabled = false;
joinButton.disabled = false;

if (location.hash) {
	code = location.hash.slice(1);
	history.replaceState(null, '', ' ');
	connectToRoom();
}

window.onhashchange = () => location.reload();
