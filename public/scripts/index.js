let isAlreadyCalling = false;
let getCalled = false;
let localStream;
let remoteStream;
let erpstream;
let stream;
const offerOptions = {
  offerToReceiveAudio: 1,
  offerToReceiveVideo: 1
};

const existingCalls = [];

const { RTCPeerConnection, RTCSessionDescription } = window;

const pcConfiguration = {'iceServers': [{'urls': 'stun:stun.l.google.com:19302'}],  'sdpSemantics' : "unified-plan" }

const peerConnection = new RTCPeerConnection(pcConfiguration);

async function callUser(socketId) {
  
  try {
    console.log('pc1 createOffer start');
    const offer = await peerConnection.createOffer(offerOptions);
    console.log(`Offer from pc1\n${offer.sdp}`);
    try {
      await peerConnection.setLocalDescription(new RTCSessionDescription(offer));
      console.log(`${peerConnection} setLocalDescription complete`);

      peerConnection.addEventListener('icecandidate', event => {
        onIceCandidate(peerConnection, event, socketId);
      });

      socket.emit("call-user", {
        offer,
        to: socketId
      });
    } catch (e) {
      console.error(`Failed to set session description: ${e.toString()}`);
    }
  } catch (e) {
    console.error(`Failed to create offer: ${e.toString()}`);
  }
}

const socket = io.connect(window.location.host);
// const socket = io.connect("http://localhost:5000");

socket.on("update-user-list", ({ users }) => {
  updateUserList(users);
});

socket.on("remove-user", ({ socketId }) => {
  const elToRemove = document.getElementById(socketId);

  if (elToRemove) {
    elToRemove.remove();
  }
});

socket.on("call-made", async data => {
  if (getCalled) {
    const confirmed = confirm(
      `User "Socket: ${data.socket}" wants to call you. Do accept this call?`
    );

    if (!confirmed) {
      socket.emit("reject-call", {
        from: data.socket
      });

      return;
    }
  }

  await peerConnection.setRemoteDescription(
    new RTCSessionDescription(data.offer)
  );
  const answer = await peerConnection.createAnswer(offerOptions);
  await peerConnection.setLocalDescription(new RTCSessionDescription(answer));

  socket.emit("make-answer", {
    answer,
    to: data.socket
  });
  getCalled = true;
});

socket.on("answer-made", async data => {
  await peerConnection.setRemoteDescription(
    new RTCSessionDescription(data.answer)
  );

  if (!isAlreadyCalling) {
    callUser(data.socket);
    isAlreadyCalling = true;
  }
});

socket.on("call-rejected", data => {
  alert(`User: "Socket: ${data.socket}" rejected your call.`);
  unselectUsersFromList();
});

socket.on("receive-ice-candidates", data => {
  // var candidate = new RTCIceCandidate({sdpMid:data.id ,sdpMLineIndex:data.    label, candidate:data.candidate});
  peerConnection.addIceCandidate(data.candidate);
});


peerConnection.ontrack = function({ streams: [stream] }) {
  const remoteVideo = document.getElementById("remote-video");
  if (remoteVideo) {
    console.log('Received remote stream!');
    remoteVideo.srcObject = stream;
  }
};

peerConnection.addEventListener('connectionstatechange', event => {
  if (peerConnection.connectionState === 'connected') {
    console.log('Peers connected!');
      // Peers connected!
  }else{
    console.error('Unable to establish connection between peers.');
  }
});


peerConnection.addEventListener('iceconnectionstatechange', event => {
  if (peerConnection) {
    console.log(`peerConnection ICE state: ${peerConnection.iceConnectionState}`);
    console.log('ICE state change event: ', event);
  }
});

peerConnection.addEventListener('icecandidateerror', event => {
  if (event.errorCode >= 300 && event.errorCode <= 699) {
    console.error(
      'STUN errors are in the range 300-699. See RFC 5389, section 15.6\
       for a list of codes. TURN adds a few more error codes; see\
       RFC 5766, section 15 for details.');
  } else if (event.errorCode >= 700 && event.errorCode <= 799) {
    console.error(
      'Server could not be reached; a specific error number is\
       provided but these are not yet specified.')
  }
});


start();

async function start() {
  // Starts the camera as soon as the page loads.
  console.log('Requesting local stream');
  try {
    
    const localStream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
    
    const localVideo = document.getElementById("local-video");
    const erpVideo = document.getElementById("erp-video");
    if (localVideo) {
      localVideo.srcObject = localStream;
    }
    // localStream = localStream;

    erpVideo.onplaying = e => {
      erpVideo.onplaying = null;
      if (erpVideo.captureStream) {
        stream = erpVideo.captureStream();
        console.log('Captured stream with captureStream', stream);
      } else if (erpVideo.mozCaptureStream) {
        stream = erpVideo.mozCaptureStream();
        console.log('Captured stream with mozCaptureStream()', stream);
      } else {
        console.log('unsupported browser');
        return;
      }
      
      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();
      if (videoTracks.length > 0) {
        console.log(`Using video device: ${videoTracks[0].label}`);
      }
      if (audioTracks.length > 0) {
        console.log(`Using audio device: ${audioTracks[0].label}`);
      }

      stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));
    };
    erpVideo.onended = e => {
      console.log('Ended. Looping back in time.');
      erpVideo.load();
      erpVideo.play();
    }
    erpVideo.play();

  } catch (e) {
    console.warn(`getUserMedia() error: ${e.message}`);
  }
}

async function onIceCandidate(pc, event, socketId) {
  try {
    // await (pc.addIceCandidate(event.candidate));
    socket.emit("handle-ice-candidates", {
      candidate: event.candidate,
      label: event.candidate.sdpMLineIndex, 
      id: event.candidate.sdpMid,
      to: socketId
    });
    console.log(`Sending IceCandidate to user: ${socketId}`);
  } catch (e) {
    console.log(`${peerConnection} failed to add ICE Candidate: ${e.toString()}`);
  }
}

function createStream(videoElement, s) {
  console.log('Create stream')
  if (s) {
    return;
  }
  if (videoElement.captureStream) {
    s = videoElement.captureStream();
    console.log('Captured stream from leftVideo with captureStream', s);
    return s;
  } else if (videoElement.mozCaptureStream) {
    s = videoElement.mozCaptureStream();
    console.log('Captured stream from leftVideo with mozCaptureStream()', s);
    return s;
  } else {
    console.log('captureStream() not supported');
  }
}

function updateUserList(socketIds) {
  const activeUserContainer = document.getElementById("active-user-container");

  socketIds.forEach(socketId => {
    const alreadyExistingUser = document.getElementById(socketId);
    if (!alreadyExistingUser) {
      const userContainerEl = createUserItemContainer(socketId);
      activeUserContainer.appendChild(userContainerEl);
    }else{

    }
  });
}

function unselectUsersFromList() {
  const alreadySelectedUser = document.querySelectorAll(
    ".active-user.active-user--selected"
  );

  alreadySelectedUser.forEach(el => {
    el.setAttribute("class", "active-user");
  });
}

function createUserItemContainer(socketId) {
  const userContainerEl = document.createElement("div");

  const usernameEl = document.createElement("p");

  userContainerEl.setAttribute("class", "active-user");
  userContainerEl.setAttribute("id", socketId);
  usernameEl.setAttribute("class", "username");
  usernameEl.innerHTML = `Socket: ${socketId}`;

  userContainerEl.appendChild(usernameEl);

  userContainerEl.addEventListener("click", () => {
    unselectUsersFromList();
    userContainerEl.setAttribute("class", "active-user active-user--selected");
    const talkingWithInfo = document.getElementById("talking-with-info");
    talkingWithInfo.innerHTML = `Talking with: "Socket: ${socketId}"`;
    callUser(socketId);
  });

  return userContainerEl;
}