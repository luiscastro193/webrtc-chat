"use strict";
const basePath = "https://webrtc-signals.herokuapp.com/";
const configuration = {iceServers: [{urls: 'stun:stun.l.google.com:19302'}]};
const timeout = 30 * 1000;

function pause(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

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

async function petitionErrorHandler(error) {
	await pause(1500);
	return null;
}

function waitForCandidates(peerConnection) {
	return new Promise(resolve => {
		if (peerConnection.iceGatheringState == 'complete')
			resolve();
		else {
			peerConnection.addEventListener('icegatheringstatechange', () =>{
				if (peerConnection.iceGatheringState == 'complete')
					resolve();
			});
		}
	});
}

function waitForDataChannel(peerConnection) {
	return new Promise((resolve, reject) => {
		let isResolved = false;
		
		if (peerConnection.connectionState == 'failed' || peerConnection.connectionState == 'closed')
			return reject();
		else {
			peerConnection.addEventListener('connectionstatechange', () => {
				if (peerConnection.connectionState == 'failed' || peerConnection.connectionState == 'closed')
					reject();
			});
		}
		
		peerConnection.addEventListener('datachannel', event => {
			if (event.channel.readyState == 'open') {
				isResolved = true;
				resolve(event.channel);
			}
			else {
				event.channel.addEventListener('open', () => {
					isResolved = true;
					resolve(event.channel)
				});
			}
		});
		
		setTimeout(() => {
			if (!isResolved) {
				peerConnection.close();
				reject();
			}
		}, timeout);
	});
}

function waitForLocalDataChannel(peerConnection, dataChannel) {
	return new Promise((resolve, reject) => {
		if (peerConnection.connectionState == 'failed' || peerConnection.connectionState == 'closed')
			return reject();
		else {
			peerConnection.addEventListener('connectionstatechange', () => {
				if (peerConnection.connectionState == 'failed' || peerConnection.connectionState == 'closed')
					reject();
			});
		}
		
		if (dataChannel.readyState == 'open')
			resolve(dataChannel);
		else
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
	
	let peerConnection = new RTCPeerConnection(configuration);
	peerConnection.setRemoteDescription(new RTCSessionDescription(petition.offer));
	peerConnection.setLocalDescription(await peerConnection.createAnswer());
	await waitForCandidates(peerConnection);
	let dataChannelPromise = waitForDataChannel(peerConnection);
	await post('answer', {room, user: petition.user, answer: peerConnection.localDescription});
	return [petition.user, await dataChannelPromise];
}

async function connect(room, user) {
	let peerConnection = new RTCPeerConnection(configuration);
	let dataChannel = peerConnection.createDataChannel('data');
	peerConnection.setLocalDescription(await peerConnection.createOffer());
	let answer = null;
			
	while (!answer) {
		await waitForCandidates(peerConnection);
		answer = await post('connect', {room, user, offer: peerConnection.localDescription}).catch(petitionErrorHandler);
	}
	
	let dataChannelPromise = waitForLocalDataChannel(peerConnection, dataChannel);
	peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
	return await dataChannelPromise;
}
