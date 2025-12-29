const API_URL = "http://localhost:5000";

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

const micButton = document.getElementById("micButton");
const recordingIndicator = document.getElementById("recordingIndicator");
const chatMessages = document.getElementById("chatMessages");
const messageInput = document.getElementById("messageInput");
const typingIndicator = document.getElementById("typingIndicator");
const personalityBadge = document.getElementById("personalityBadge");
const personalityValue = document.getElementById("personalityValue");

/* ---------------- UI ---------------- */
function addMessage(text, sender, personality=null, emotion=null) {
    const div = document.createElement("div");
    div.className = `message ${sender}-message`;

    div.innerHTML = `
        <div class="message-content">
            <p>${text}</p>
            ${sender === "bot" ? `
                <div class="message-meta">
                    ${personality ? `<span class="meta-badge personality-meta">Personality: ${personality}</span>` : ""}
                    ${emotion ? `<span class="meta-badge emotion-meta">Emotion: ${emotion}</span>` : ""}
                </div>` : ""}
        </div>
        <div class="message-time">${new Date().toLocaleTimeString()}</div>
    `;

    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTyping() { typingIndicator.style.display = "flex"; }
function hideTyping() { typingIndicator.style.display = "none"; }

function updatePersonality(personality) {
    personalityValue.textContent = personality;
    personalityBadge.style.display = "block";
}

/* ---------------- MIC CONTROL ---------------- */
micButton.addEventListener("click", async () => {
    if (!isRecording) startRecording();
    else stopRecording();
});

async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus"
    });

    audioChunks = [];

    mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());

        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        await sendVoice(audioBlob);

        audioChunks = [];
        isRecording = false;
        micButton.classList.remove("recording");
        recordingIndicator.style.display = "none";
    };

    mediaRecorder.start();
    isRecording = true;
    micButton.classList.add("recording");
    recordingIndicator.style.display = "flex";
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
    }
}

/* ---------------- SEND VOICE ---------------- */
async function sendVoice(blob) {
    showTyping();
    addMessage("🎤 Voice message sent", "user");

    const formData = new FormData();
    formData.append("audio", blob, "voice.webm");

    const res = await fetch(`${API_URL}/chat/voice`, {
        method: "POST",
        body: formData
    });

    const data = await res.json();
    hideTyping();

    // Replace placeholder with transcription
    const lastUser = document.querySelector(".user-message:last-child p");
    if (lastUser) lastUser.textContent = data.transcribed_message;

    addMessage(data.reply, "bot", data.personality, data.emotion);
    updatePersonality(data.personality);

    if (data.audio_url) {
        new Audio(API_URL + data.audio_url).play();
    }
}

/* ---------------- TEXT CHAT ---------------- */
async function sendMessage() {
    const msg = messageInput.value.trim();
    if (!msg) return;

    addMessage(msg, "user");
    messageInput.value = "";
    showTyping();

    const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg })
    });

    const data = await res.json();
    hideTyping();

    addMessage(data.reply, "bot", data.personality, data.emotion);
    updatePersonality(data.personality);

    if (data.audio_url) {
        new Audio(API_URL + data.audio_url).play();
    }
}

messageInput.addEventListener("keydown", e => {
    if (e.key === "Enter") sendMessage();
});
