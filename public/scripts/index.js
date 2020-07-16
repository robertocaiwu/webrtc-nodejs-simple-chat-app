let isAlreadyCalling = false;
let getCalled = false;
let localStream;
let remoteStream;
let erpstream;
let stream;

const existingCalls = [];

const { RTCPeerConnection, RTCSessionDescription } = window;

const pcConfiguration = {'iceServers': [{'urls': 'stun:stun.l.google.com:19302'}],  'sdpSemantics' : "unified-plan" }

const peerConnection = new RTCPeerConnection(pcConfiguration);

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

async function callUser(socketId) {
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(new RTCSessionDescription(offer));

  peerConnection.addEventListener('icecandidate', event => {
      if (event.candidate) {
          signalingChannel.send({'new-ice-candidate': event.candidate});
          console.log("ICE candidate found: ", event.candidate);
      }else{
        console.log("ICE candidate not found.");
      }
  });

  socket.emit("call-user", {
    offer,
    to: socketId
  });


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

start();

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
  const answer = await peerConnection.createAnswer();
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

peerConnection.ontrack = function({ streams: [stream] }) {
  const remoteVideo = document.getElementById("remote-video");
  if (remoteVideo) {
    remoteVideo.srcObject = stream;
  }
};

peerConnection.addEventListener('connectionstatechange', event => {
  if (peerConnection.connectionState === 'connected') {
    console.log('Peers connected!');
      // Peers connected!
  }else{
    console.log('Unable to establish connection between peers.');
  }
});


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

    // erpVideo.oncanplay = createStream;
    // if (erpVideo.readyState >= 3) { // HAVE_FUTURE_DATA
    //   // Video is already ready to play, call createStream in case oncanplay
    //   // fired before we registered the event handler.
    //   createStream(erpVideo);
    // }

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

async function onIceCandidate(pc, event) {
  try {
    await (pc.addIceCandidate(event.candidate));
    console.log(`${pc} addIceCandidate success`);
  } catch (e) {
    console.log(`${pc} failed to add ICE Candidate: ${e.toString()}`);
  }
  console.log(`${getName(pc)} ICE candidate:\n${event.candidate ? event.candidate.candidate : '(null)'}`);
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