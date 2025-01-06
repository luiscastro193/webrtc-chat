"use strict";
const basePath = "http://localhost:5000/";
//const basePath = "https://luiscastro193.com/webrtc-signals/"; TODO
const timeout = 15 * 1000;

async function request(resource, options) {
	let response = await fetch(resource, options);
	if (response.ok) return response; else throw response;
}

async function isTimeout(error) {
	if (error?.status != 404) return false;
	let content = await error.json?.().catch(() => {});
	return content?.message == "timeout";
}

async function petitionErrorHandler(error) {
	if (await isTimeout(error)) return;
	console.error(error);
	return new Promise(resolve => setTimeout(resolve, 3000));
}

async function securePromise(call, ...args) {
	let result;
	
	while (!result)
		result = await call(...args).catch(petitionErrorHandler);
	
	return result;
}

async function configurationPromise() {
	let response = await request(basePath + 'servers');
	return {iceServers: await response.json()};
}

const configuration = securePromise(configurationPromise);

async function post(path, data) {
	let response = await request(basePath + path, {method: 'POST', body: JSON.stringify(data)});
	return response.json();
}

async function waitForChannel(channel, peerConnection) {
	let promise = new Promise((resolve, reject) => {
		if (channel.readyState == 'open') return resolve(channel);
		if (channel.readyState == 'closed') return reject();
		channel.addEventListener('open', () => resolve(channel));
		channel.addEventListener('close', () => reject());
		setTimeout(reject, timeout);
	});
	promise.catch(() => channel.close());
	return promise;
}

function sendCandidates(peerConnection, id, targetId) {
	peerConnection.addEventListener('icecandidate', event => {
		const candidateId = crypto.randomUUID();
		securePromise(() => post('candidate', {candidate: event.candidate, candidateId, id, targetId}));
	});
}

class Candidates {
	constructor(id) {
		this.id = id;
		this.connections = new Map();
		this.active = false;
	}
	
	register(peerConnection, targetId) {
		this.connections.set(targetId, peerConnection);
		if (!this.active) this.activate();
	}
	
	checkActive() {
		for (const [targetId, peerConnection] of this.connections.entries()) {
			if (peerConnection.connectionState == 'closed')
				this.connections.delete(targetId);
		}
		
		this.active = this.connections.size > 0;
	}
	
	async activate() {
		this.checkActive();
		while (this.active) {
			let response = await post('candidate-request', {id: this.id}).catch(petitionErrorHandler);
			if (response)
				this.connections.get(response.targetId)?.addIceCandidate(new RTCIceCandidate(response.candidate));
			this.checkActive();
		}
	}
}

export class Host {
	constructor(room) {
		this.room = room;
		this.id = crypto.randomUUID();
		this.candidates = new Candidates(this.id);
		this.queue = [];
		this.eventTarget = new EventTarget();
		this.event = new Event('e');
		this.listening = true;
		this.listen();
	}
	
	async listen() {
		while (this.listening) {
			let petition = await post('petition-request', {room: this.room, id: this.id}).catch(petitionErrorHandler);
			if (petition) this.handleConnection(petition);
		}
	}
	
	async handleConnection(petition) {
		const peerConnection = new RTCPeerConnection(await configuration);
		const dataChannel = peerConnection.createDataChannel('data', {negotiated: true, id: 0});
		dataChannel.addEventListener('close', () => peerConnection.close());
		const channelPromise = waitForChannel(dataChannel);
		await peerConnection.setRemoteDescription(new RTCSessionDescription(petition.offer));
		this.candidates.register(peerConnection, petition.id);
		await peerConnection.setLocalDescription(await peerConnection.createAnswer());
		sendCandidates(peerConnection, this.id, petition.id);
		await post('answer', {answer: peerConnection.localDescription, targetId: petition.id});
		const channel = [petition.user, await channelPromise];
		
		if (this.listening) {
			this.queue.push(channel);
			this.eventTarget.dispatchEvent(this.event);
		}
		else
			channel[1].close();
	}
	
	async nextChannel() {
		return new Promise(resolve => {
			const queue = this.queue;
			let channel = queue.shift();
			if (channel) return resolve(channel);
			const eventTarget = this.eventTarget;
			
			eventTarget.addEventListener('e', function listener() {
				channel = queue.shift();
				if (channel) {
					eventTarget.removeEventListener('e', listener);
					resolve(channel);
				}
			});
		});
	}
	
	stopListening() {
		this.listening = false;
		this.queue.forEach(channel => channel.close());
		this.queue = [];
	}
}

export async function connect(room, user) {
	const peerConnection = new RTCPeerConnection(await configuration);
	const dataChannel = peerConnection.createDataChannel('data', {negotiated: true, id: 0});
	dataChannel.addEventListener('close', () => peerConnection.close());
	await peerConnection.setLocalDescription(await peerConnection.createOffer());
	const id = crypto.randomUUID();
	const targetId = await securePromise(() => post('id-request', {room})).then(response => response.id);
	const channelPromise = waitForChannel(dataChannel);
	sendCandidates(peerConnection, id, targetId);
	let answer = await post('petition', {offer: peerConnection.localDescription, id, user, targetId});
	await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
	new Candidates(id).register(peerConnection, targetId);
	return channelPromise;
}
