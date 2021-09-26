"use strict";
const basePath = "https://webrtc-signals.herokuapp.com/";
const timeout = 5 * 1000;

function petitionErrorHandler(error) {
	return new Promise(resolve => setTimeout(() => resolve(null), 1500));
}

function configurationPromise() {
	return new Promise((resolve, reject) => {
		let request = new XMLHttpRequest();
		request.open('GET', basePath + 'servers');
		request.responseType = "json";
		request.onload = () => {
			if (request.status < 400)
				resolve({iceServers: request.response});
			else
				reject(request.statusText);
		};
		request.onerror = () => reject(request.statusText);
		request.send();
	});
}

async function secureConfigurationPromise() {
	let myConfiguration;
	
	while (!myConfiguration)
		myConfiguration = await configurationPromise().catch(petitionErrorHandler);
	
	return myConfiguration;
}

const configuration = secureConfigurationPromise();

function post(path, data) {
	return new Promise((resolve, reject) => {
		let request = new XMLHttpRequest();
		request.open('POST', basePath + path);
		request.responseType = "json";
		request.onload = () => {
			if (request.status < 400)
				resolve(request.response);
			else
				reject(request.statusText);
		};
		request.onerror = () => reject(request.statusText);
		request.send(JSON.stringify(data));
	});
}

function waitForCandidates(peerConnection) {
	return new Promise(resolve => {
		if (peerConnection.iceGatheringState == 'complete')
			return resolve();
		
		peerConnection.addEventListener('icegatheringstatechange', () => {
			if (peerConnection.iceGatheringState == 'complete')
				resolve();
		});
		
		setTimeout(() => resolve(), timeout);
	});
}

function waitForDataChannel(peerConnection, dataChannel) {
	return new Promise((resolve, reject) => {
		if (peerConnection.connectionState == 'failed' || peerConnection.connectionState == 'closed')
			return reject();
		
		peerConnection.addEventListener('connectionstatechange', () => {
			if (peerConnection.connectionState == 'failed' || peerConnection.connectionState == 'closed') {
				peerConnection.close();
				reject();
			}
		});
		
		if (dataChannel.readyState == 'open')
			return resolve(dataChannel);
		
		dataChannel.addEventListener('open', () => resolve(dataChannel));
		
		setTimeout(() => {
			if (dataChannel.readyState != 'open') {
				peerConnection.close();
				reject();
			}
		}, timeout);
	});
}

async function host(room) {
	let petition = null;
	
	while (!petition)
		petition = await post('host-room', {room}).catch(petitionErrorHandler);
	
	let peerConnection = new RTCPeerConnection(await configuration);
	let dataChannel = peerConnection.createDataChannel('data', {negotiated: true, id: 0});
	await peerConnection.setRemoteDescription(new RTCSessionDescription(petition.offer));
	await peerConnection.setLocalDescription(await peerConnection.createAnswer());
	await waitForCandidates(peerConnection);
	await post('answer', {room, user: petition.user, answer: peerConnection.localDescription});
	return [petition.user, await waitForDataChannel(peerConnection, dataChannel)];
}

async function connect(room, user) {
	let peerConnection = new RTCPeerConnection(await configuration);
	let dataChannel = peerConnection.createDataChannel('data', {negotiated: true, id: 0});
	await peerConnection.setLocalDescription(await peerConnection.createOffer());
	let answer = null;
			
	while (!answer) {
		await waitForCandidates(peerConnection);
		answer = await post('connect', {room, user, offer: peerConnection.localDescription}).catch(petitionErrorHandler);
	}
	
	peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
	return waitForDataChannel(peerConnection, dataChannel);
}
