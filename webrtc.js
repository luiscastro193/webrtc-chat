"use strict";
const basePath = "https://luiscastro193.com/webrtc-signals/";
const timeout = 3 * 1000;

async function request(resource, options) {
	let response = await fetch(resource, options);
	if (response.ok) return response; else throw response;
}

function petitionErrorHandler(error) {
	return new Promise(resolve => setTimeout(resolve, 1000));
}

async function configurationPromise() {
	let response = await request(basePath + 'servers');
	return {iceServers: await response.json()};
}

async function secureConfigurationPromise() {
	let myConfiguration;
	
	while (!myConfiguration)
		myConfiguration = await configurationPromise().catch(petitionErrorHandler);
	
	return myConfiguration;
}

const configuration = secureConfigurationPromise();

async function post(path, data) {
	let response = await request(basePath + path, {method: 'POST', body: JSON.stringify(data)});
	return response.json();
}

function waitForCandidates(peerConnection) {
	return new Promise(resolve => {
		if (peerConnection.iceGatheringState == 'complete')
			return resolve();
		
		peerConnection.addEventListener('icecandidate', event => {
			if (!event.candidate)
				resolve();
		});
		
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

export async function host(room) {
	let petition = null;
	
	while (!petition)
		petition = await post('host-room', {room}).catch(petitionErrorHandler);
	
	let peerConnection = new RTCPeerConnection(await configuration);
	let isReady = waitForCandidates(peerConnection);
	let dataChannel = peerConnection.createDataChannel('data', {negotiated: true, id: 0});
	await peerConnection.setRemoteDescription(new RTCSessionDescription(petition.offer));
	await peerConnection.setLocalDescription(await peerConnection.createAnswer());
	await isReady;
	await post('answer', {room, user: petition.user, answer: peerConnection.localDescription});
	return [petition.user, await waitForDataChannel(peerConnection, dataChannel)];
}

export async function connect(room, user) {
	let peerConnection = new RTCPeerConnection(await configuration);
	let isReady = waitForCandidates(peerConnection);
	let dataChannel = peerConnection.createDataChannel('data', {negotiated: true, id: 0});
	await peerConnection.setLocalDescription(await peerConnection.createOffer());
	await isReady;
	let answer = null;
			
	while (!answer)
		answer = await post('connect', {room, user, offer: peerConnection.localDescription}).catch(petitionErrorHandler);
	
	peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
	return waitForDataChannel(peerConnection, dataChannel);
}
