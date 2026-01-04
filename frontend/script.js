const API_URL = "http://localhost:5000";

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
// Get userId from localStorage or generate new one
let userId = localStorage.getItem('finpsyche_userId') || Math.floor(Math.random() * 1000000).toString();
localStorage.setItem('finpsyche_userId', userId); // Persist userId
let historyLoaded = false;
let currentView = 'chat'; // 'chat' or 'history'

const micButton = document.getElementById("micButton");
const recordingIndicator = document.getElementById("recordingIndicator");
const chatMessages = document.getElementById("chatMessages");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const typingIndicator = document.getElementById("typingIndicator");
const personalityBadge = document.getElementById("personalityBadge");
const personalityValue = document.getElementById("personalityValue");
const loadHistoryBtn = document.getElementById("loadHistoryBtn");
const historySidebar = document.getElementById("historySidebar");
const historyList = document.getElementById("historyList");
const backBtn = document.getElementById("backBtn");
const gameBtn = document.getElementById("gameBtn");
const gameModal = document.getElementById("gameModal");
const gameContent = document.getElementById("gameContent");
const closeGameBtn = document.getElementById("closeGameBtn");
const landingPage = document.getElementById("landingPage");
const mainContainer = document.getElementById("mainContainer");
const chooseChatbot = document.getElementById("chooseChatbot");
const chooseGames = document.getElementById("chooseGames");
const gameTitle = document.getElementById("gameTitle");
const backToMainBtn = document.getElementById("backToMainBtn");
const downloadReportBtn = document.getElementById("downloadReportBtn");
const downloadReportBtnChat = document.getElementById("downloadReportBtnChat");

// Game state
let gameState = {
    currentGame: null, // 'bias', 'calm', 'speed'
    currentQuestion: 0,
    score: 0,
    results: [],
    gameStartTime: null
};

// Initialize
document.addEventListener("DOMContentLoaded", () => {
    // Landing page choices
    if (chooseChatbot) {
        chooseChatbot.addEventListener("click", () => {
            showChatbot();
        });
    }
    
    if (chooseGames) {
        chooseGames.addEventListener("click", () => {
            showGames();
        });
    }
    
    // Check if user already made a choice (for page refresh)
    const savedChoice = localStorage.getItem('finpsyche_choice');
    if (savedChoice === 'chatbot') {
        showChatbot();
    } else if (savedChoice === 'games') {
        showGames();
    }
    
    messageInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            sendMessage();
        }
    });

    micButton.addEventListener("click", toggleRecording);
    
    // Load chat history button
    if (loadHistoryBtn) {
        loadHistoryBtn.addEventListener("click", () => {
            showHistorySidebar();
        });
    }
    
    // Back button
    if (backBtn) {
        backBtn.addEventListener("click", () => {
            hideHistorySidebar();
        });
    }
    
    // Game button (only if in chatbot mode)
    if (gameBtn) {
        gameBtn.addEventListener("click", () => {
            showGames();
        });
    }
    
    // Close game button
    if (closeGameBtn) {
        closeGameBtn.addEventListener("click", () => {
            hideGame();
        });
    }
    
    // Close game on outside click
    if (gameModal) {
        gameModal.addEventListener("click", (e) => {
            if (e.target === gameModal) {
                hideGame();
            }
        });
    }
    
    // Back to main button
    if (backToMainBtn) {
        backToMainBtn.addEventListener("click", () => {
            goBackToMain();
        });
    }
    
    // Download report buttons
    if (downloadReportBtn) {
        downloadReportBtn.addEventListener("click", () => {
            generateAndDownloadReport();
        });
    }
    
    if (downloadReportBtnChat) {
        downloadReportBtnChat.addEventListener("click", () => {
            generateAndDownloadReport();
        });
    }
});

// Load chat history
async function loadChatHistory() {
    if (historyLoaded && chatMessages.children.length > 1) {
        console.log("History already loaded");
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/chat/history/${userId}`, {
            method: "GET",
            headers: { "Content-Type": "application/json" }
        });

        if (!response.ok) {
            console.error("Failed to load chat history");
            return;
        }

        const data = await response.json();
        
        if (data.success && data.messages && data.messages.length > 0) {
            // Clear all existing messages (including initial bot message)
            chatMessages.innerHTML = '';
            
            // Display chat history (both user and bot messages)
            data.messages.forEach((msg) => {
                const sender = msg.sender || "user"; // Default to user if sender not specified
                // Only show emotion/personality for user messages, not bot messages
                if (sender === "user") {
                    addMessage(msg.text, sender, msg.emotion, msg.personality, msg.timestamp);
                } else {
                    addMessage(msg.text, sender, null, null, msg.timestamp);
                }
            });
            
            historyLoaded = true;
            console.log(`✅ Loaded ${data.messages.length} messages from history`);
            
            // Show notification
            if (loadHistoryBtn) {
                loadHistoryBtn.textContent = `📜 History (${data.messages.length})`;
            }
        } else {
            console.log("No chat history found");
            // Keep the initial bot message if no history exists
            if (loadHistoryBtn) {
                loadHistoryBtn.textContent = `📜 History (0)`;
            }
        }
    } catch (error) {
        console.error("Error loading chat history:", error);
    }
}

// Send text message
async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    addMessage(text, "user");
    messageInput.value = "";
    
    showTyping();
    
    try {
        const response = await fetch(`${API_URL}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text, user_id: userId })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        hideTyping();

        // Handle both 'reply' and 'response' keys
        const botMessage = data.reply || data.response || "I'm here to help with your financial questions.";
        
        // Extract just the financial advice or response text for display
        let displayText = botMessage;
        if (botMessage.includes('financial_advice:')) {
            const lines = botMessage.split('\n');
            for (const line of lines) {
                if (line.includes('financial_advice:')) {
                    displayText = line.split('financial_advice:')[1].trim();
                    break;
                }
            }
        } else if (botMessage.includes('response:')) {
            const lines = botMessage.split('\n');
            for (const line of lines) {
                if (line.includes('response:')) {
                    displayText = line.split('response:')[1].trim();
                    break;
                }
            }
        }

        addMessage(displayText, "bot"); // Bot messages don't show emotion/personality

        if (data.personality) {
            updatePersonalityBadge(data.personality);
        }

        // Play audio if available
        if (data.audio_url) {
            playAudio(`${API_URL}${data.audio_url}`);
        }
    } catch (error) {
        hideTyping();
        addMessage("Sorry, I'm having trouble connecting. Please try again.", "bot");
        console.error("Error:", error);
    }
}

// Toggle recording
async function toggleRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        await startRecording();
    }
}

// Start recording
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
            await sendAudio(audioBlob);
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        isRecording = true;
        micButton.classList.add("recording");
        recordingIndicator.style.display = "flex";
    } catch (error) {
        console.error("Error accessing microphone:", error);
        alert("Could not access microphone. Please check permissions.");
    }
}

// Stop recording
function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        micButton.classList.remove("recording");
        recordingIndicator.style.display = "none";
    }
}

// Send audio
async function sendAudio(audioBlob) {
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.wav");
    formData.append("user_id", userId);

    addMessage("🎤 Voice message sent", "user");
    showTyping();

    try {
        const response = await fetch(`${API_URL}/chat/voice`, {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        hideTyping();

        // Update user message with transcription if available
        if (data.transcribed_message) {
            const userMessages = chatMessages.querySelectorAll('.user-message');
            if (userMessages.length > 0) {
                const lastUserMsg = userMessages[userMessages.length - 1];
                const contentP = lastUserMsg.querySelector('.message-content p');
                if (contentP) {
                    contentP.textContent = data.transcribed_message;
                }
            }
        }

        // Handle both 'reply' and 'response' keys
        const botMessage = data.reply || data.response || "I'm here to help with your financial questions.";
        
        // Extract just the financial advice or response text for display
        let displayText = botMessage;
        if (botMessage.includes('financial_advice:')) {
            const lines = botMessage.split('\n');
            for (const line of lines) {
                if (line.includes('financial_advice:')) {
                    displayText = line.split('financial_advice:')[1].trim();
                    break;
                }
            }
        } else if (botMessage.includes('response:')) {
            const lines = botMessage.split('\n');
            for (const line of lines) {
                if (line.includes('response:')) {
                    displayText = line.split('response:')[1].trim();
                    break;
                }
            }
        }

        addMessage(displayText, "bot"); // Bot messages don't show emotion/personality

        if (data.personality) {
            updatePersonalityBadge(data.personality);
        }
        
        // Play audio if available
        if (data.audio_url) {
            playAudio(`${API_URL}${data.audio_url}`);
        }
    } catch (error) {
        hideTyping();
        addMessage("Sorry, I couldn't process the audio. Please try again.", "bot");
        console.error("Error:", error);
    }
}

// Add message to chat
function addMessage(text, sender, emotion = null, personality = null, timestamp = null) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${sender}-message`;
    
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    
    if (sender === "bot") {
        avatar.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="#10b981"/>
                <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" stroke="white" stroke-width="2" stroke-linecap="round"/>
            </svg>
        `;
    } else {
        avatar.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="#3b82f6"/>
                <path d="M12 14c2 0 3-1 3-2.5S14 9 12 9s-3 .5-3 2.5S10 14 12 14zM9 9v.01M15 9v.01" stroke="white" stroke-width="2" stroke-linecap="round"/>
            </svg>
        `;
    }

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";

    const content = document.createElement("div");
    content.className = "message-content";
    content.innerHTML = `<p>${text}</p>`;

    const time = document.createElement("div");
    time.className = "message-time";
    
    // Use provided timestamp or current time
    if (timestamp) {
        try {
            const date = new Date(timestamp);
            time.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
    } else {
        time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    bubble.appendChild(content);

    if (emotion) {
        const emotionBadge = document.createElement("div");
        emotionBadge.className = "emotion-badge";
        // Map emotions to appropriate emojis
        const emotionEmojis = {
            'stress': '😰',
            'stressed': '😰',
            'anxiety': '😟',
            'anxious': '😟',
            'fear': '😨',
            'fearful': '😨',
            'worry': '😟',
            'worried': '😟',
            'happy': '😊',
            'joy': '😄',
            'joyful': '😄',
            'excited': '🤩',
            'excitement': '🤩',
            'calm': '😌',
            'calmness': '😌',
            'confident': '😎',
            'confidence': '😎',
            'neutral': '😐',
            'sad': '😢',
            'sadness': '😢',
            'angry': '😠',
            'anger': '😠',
            'frustrated': '😤',
            'frustration': '😤'
        };
        const emotionLower = emotion.toLowerCase();
        const emoji = emotionEmojis[emotionLower] || ''; // Use empty string if no emoji found
        emotionBadge.innerHTML = emoji ? `<span>${emoji}</span> ${emotion}` : emotion;
        bubble.appendChild(emotionBadge);
    }

    bubble.appendChild(time);

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(bubble);
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Update personality badge
function updatePersonalityBadge(personality) {
    personalityValue.textContent = personality;
    personalityBadge.style.display = "flex";
}

// Show typing indicator
function showTyping() {
    typingIndicator.style.display = "flex";
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Hide typing indicator
function hideTyping() {
    typingIndicator.style.display = "none";
}

// Play audio response
function playAudio(audioUrl) {
    try {
        const audio = new Audio(audioUrl);
        audio.play().catch(error => {
            console.error("Error playing audio:", error);
        });
    } catch (error) {
        console.error("Error creating audio element:", error);
    }
}

// ===========================
// HISTORY SIDEBAR FUNCTIONS
// ===========================

async function showHistorySidebar() {
    currentView = 'history';
    if (historySidebar) {
        historySidebar.style.display = 'flex';
    }
    
    // Hide main container
    const container = document.querySelector('.container');
    if (container) {
        container.style.marginLeft = '300px';
    }
    
    // Load and display history list
    await loadHistoryList();
}

function hideHistorySidebar() {
    currentView = 'chat';
    if (historySidebar) {
        historySidebar.style.display = 'none';
    }
    
    // Show main container
    const container = document.querySelector('.container');
    if (container) {
        container.style.marginLeft = '0';
    }
}

async function loadHistoryList() {
    try {
        const response = await fetch(`${API_URL}/chat/history/${userId}`, {
            method: "GET",
            headers: { "Content-Type": "application/json" }
        });

        if (!response.ok) {
            console.error("Failed to load chat history");
            return;
        }

        const data = await response.json();
        
        if (historyList) {
            historyList.innerHTML = '';
            
            if (data.success && data.messages && data.messages.length > 0) {
                // Group messages by conversation (simple grouping by time proximity)
                const conversations = groupMessagesIntoConversations(data.messages);
                
                conversations.forEach((conversation, index) => {
                    const item = document.createElement('div');
                    item.className = 'history-item';
                    
                    // Get first user message as title
                    const firstUserMsg = conversation.find(msg => msg.sender === 'user');
                    const title = firstUserMsg ? firstUserMsg.text.substring(0, 50) : `Conversation ${index + 1}`;
                    const preview = conversation.length > 0 ? conversation[conversation.length - 1].text.substring(0, 80) : '';
                    
                    item.innerHTML = `
                        <div class="history-item-title">${title}${title.length >= 50 ? '...' : ''}</div>
                        <div class="history-item-preview">${preview}${preview.length >= 80 ? '...' : ''}</div>
                    `;
                    
                    item.addEventListener('click', () => {
                        loadConversation(conversation);
                        hideHistorySidebar();
                    });
                    
                    historyList.appendChild(item);
                });
            } else {
                historyList.innerHTML = '<div style="color: rgba(255,255,255,0.6); padding: 20px; text-align: center;">No chat history yet</div>';
            }
        }
    } catch (error) {
        console.error("Error loading history list:", error);
    }
}

function groupMessagesIntoConversations(messages) {
    // Simple grouping: if messages are within 30 minutes, they're the same conversation
    const conversations = [];
    let currentConversation = [];
    
    messages.forEach((msg, index) => {
        if (index === 0) {
            currentConversation.push(msg);
        } else {
            const prevMsg = messages[index - 1];
            const timeDiff = new Date(msg.timestamp) - new Date(prevMsg.timestamp);
            const minutesDiff = timeDiff / (1000 * 60);
            
            if (minutesDiff > 30) {
                conversations.push([...currentConversation]);
                currentConversation = [msg];
            } else {
                currentConversation.push(msg);
            }
        }
    });
    
    if (currentConversation.length > 0) {
        conversations.push(currentConversation);
    }
    
    return conversations;
}

function loadConversation(conversation) {
    chatMessages.innerHTML = '';
    conversation.forEach((msg) => {
        const sender = msg.sender || "user";
        if (sender === "user") {
            addMessage(msg.text, sender, msg.emotion, msg.personality, msg.timestamp);
        } else {
            addMessage(msg.text, sender, null, null, msg.timestamp);
        }
    });
    historyLoaded = true;
}

// ===========================
// LANDING PAGE FUNCTIONS
// ===========================

function showChatbot() {
    if (landingPage) landingPage.style.display = 'none';
    if (mainContainer) mainContainer.style.display = 'block';
    localStorage.setItem('finpsyche_choice', 'chatbot');
}

function showGames() {
    if (landingPage) landingPage.style.display = 'none';
    if (mainContainer) mainContainer.style.display = 'block';
    localStorage.setItem('finpsyche_choice', 'games');
    startGameSelection();
}

function goBackToMain() {
    if (mainContainer) mainContainer.style.display = 'none';
    if (landingPage) landingPage.style.display = 'flex';
    if (gameModal) gameModal.style.display = 'none';
    if (historySidebar) historySidebar.style.display = 'none';
    localStorage.removeItem('finpsyche_choice');
}

// ===========================
// GAME DATA
// ===========================

// Game 1: Bias Spotter
const biasSpotterQuestions = [
    {
        scenario: "John sees the market drop 5% and immediately sells all his stocks, saying 'I can't afford to lose more.'",
        correctBias: "Fear",
        options: ["Fear", "Overconfidence", "Herd mentality"],
        explanation: "This is Fear bias - making decisions based on fear of loss rather than rational analysis."
    },
    {
        scenario: "Sarah invests heavily in a single stock because she 'knows' it will double in value, ignoring diversification advice.",
        correctBias: "Overconfidence",
        options: ["Fear", "Overconfidence", "Herd mentality"],
        explanation: "This is Overconfidence bias - overestimating one's knowledge or ability to predict outcomes."
    },
    {
        scenario: "Mike buys cryptocurrency because all his friends are doing it and he doesn't want to miss out on the trend.",
        correctBias: "Herd mentality",
        options: ["Fear", "Overconfidence", "Herd mentality"],
        explanation: "This is Herd mentality - following the crowd without independent analysis."
    },
    {
        scenario: "Emma panics and withdraws all her retirement funds during a market downturn, fearing total loss.",
        correctBias: "Fear",
        options: ["Fear", "Overconfidence", "Herd mentality"],
        explanation: "This is Fear bias - extreme fear leading to irrational decisions that lock in losses."
    },
    {
        scenario: "Tom invests 80% of his portfolio in tech stocks because he works in tech and believes he understands the sector better than professionals.",
        correctBias: "Overconfidence",
        options: ["Fear", "Overconfidence", "Herd mentality"],
        explanation: "This is Overconfidence bias - overestimating expertise in a specific area."
    }
];

// Game 2: Calm-or-React
const calmReactQuestions = [
    {
        message: "URGENT: Stock XYZ just crashed 20%! Act now!",
        waitTime: 3,
        correctAction: "wait"
    },
    {
        message: "BREAKING: Bitcoin hits all-time high! Buy now before it's too late!",
        waitTime: 3,
        correctAction: "wait"
    },
    {
        message: "ALERT: Your portfolio is down 15% this week! Emergency action required!",
        waitTime: 3,
        correctAction: "wait"
    },
    {
        message: "HOT TIP: Stock ABC will double tomorrow! Limited time offer!",
        waitTime: 3,
        correctAction: "wait"
    },
    {
        message: "WARNING: Market crash incoming! Sell everything immediately!",
        waitTime: 3,
        correctAction: "wait"
    }
];

// Game 3: Yes/No Speed Test
const speedTestQuestions = [
    { prompt: "Should you invest all your savings in one hot stock?", correct: false, timeLimit: 2 },
    { prompt: "Is it wise to panic sell during market volatility?", correct: false, timeLimit: 2 },
    { prompt: "Should you diversify your investment portfolio?", correct: true, timeLimit: 2 },
    { prompt: "Is it good to invest based on social media tips?", correct: false, timeLimit: 2 },
    { prompt: "Should you have an emergency fund before investing?", correct: true, timeLimit: 2 }
];

// ===========================
// GAME FUNCTIONS
// ===========================

function startGameSelection() {
    gameState = {
        currentGame: null,
        currentQuestion: 0,
        score: 0,
        results: [],
        gameStartTime: Date.now()
    };
    
    if (gameModal) {
        gameModal.style.display = 'flex';
    }
    
    renderGameSelection();
}

function renderGameSelection() {
    if (!gameContent) return;
    
    const html = `
        <div style="text-align: center; padding: 20px;">
            <h2 style="margin-bottom: 32px; color: #1e293b;">Choose Your Training Game</h2>
            <div style="display: flex; flex-direction: column; gap: 16px;">
                <button class="game-button-action" onclick="startBiasSpotter()" style="background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);">
                    🎯 Bias Spotter Game
                    <div style="font-size: 14px; font-weight: 400; margin-top: 8px;">Identify financial biases in scenarios</div>
                </button>
                <button class="game-button-action" onclick="startCalmReact()" style="background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%);">
                    ⏸️ Calm-or-React Game
                    <div style="font-size: 14px; font-weight: 400; margin-top: 8px;">Practice impulse control</div>
                </button>
                <button class="game-button-action" onclick="startSpeedTest()" style="background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);">
                    ⚡ Yes/No Speed Test
                    <div style="font-size: 14px; font-weight: 400; margin-top: 8px;">Test your quick decision-making</div>
                </button>
            </div>
        </div>
    `;
    
    gameContent.innerHTML = html;
    if (gameTitle) gameTitle.textContent = "Financial Training Games";
}

function hideGame() {
    if (gameModal) {
        gameModal.style.display = 'none';
    }
    gameState = {
        currentGame: null,
        currentQuestion: 0,
        score: 0,
        results: [],
        gameStartTime: null
    };
}

// Game 1: Bias Spotter
function startBiasSpotter() {
    gameState.currentGame = 'bias';
    gameState.currentQuestion = 0;
    gameState.score = 0;
    gameState.results = [];
    if (gameTitle) gameTitle.textContent = "Bias Spotter Game";
    renderBiasSpotter();
}

function renderBiasSpotter() {
    if (!gameContent) return;
    
    if (gameState.currentQuestion >= biasSpotterQuestions.length) {
        showBiasSpotterSummary();
        return;
    }
    
    const question = biasSpotterQuestions[gameState.currentQuestion];
    
    const html = `
        <div class="game-scenario">
            <h3>Question ${gameState.currentQuestion + 1} of ${biasSpotterQuestions.length}</h3>
            <p>${question.scenario}</p>
            <p style="margin-top: 16px; font-weight: 600;">What bias is this person showing?</p>
        </div>
        <div class="game-options">
            ${question.options.map((option, index) => `
                <div class="game-option" onclick="selectBias('${option}')">
                    ${option}
                </div>
            `).join('')}
        </div>
        <div style="text-align: center; margin-top: 24px; font-size: 18px; font-weight: 600; color: #3b82f6;">
            Score: ${gameState.score} / ${gameState.currentQuestion}
        </div>
    `;
    
    gameContent.innerHTML = html;
}

function selectBias(selectedBias) {
    const question = biasSpotterQuestions[gameState.currentQuestion];
    const isCorrect = selectedBias === question.correctBias;
    
    if (isCorrect) {
        gameState.score++;
    }
    
    gameState.results.push({
        question: question.scenario,
        selected: selectedBias,
        correct: question.correctBias,
        isCorrect: isCorrect,
        explanation: question.explanation
    });
    
    // Show result
    const html = `
        <div class="game-scenario">
            <h3>Question ${gameState.currentQuestion + 1} of ${biasSpotterQuestions.length}</h3>
            <p>${question.scenario}</p>
        </div>
        <div class="${isCorrect ? 'game-result' : 'game-bias'}">
            <h3>${isCorrect ? '✅ Correct!' : '❌ Incorrect'}</h3>
            <p><strong>Your answer:</strong> ${selectedBias}</p>
            <p><strong>Correct answer:</strong> ${question.correctBias}</p>
            <p style="margin-top: 12px;">${question.explanation}</p>
        </div>
        <button class="game-button-action" onclick="nextBiasQuestion()">
            ${gameState.currentQuestion < biasSpotterQuestions.length - 1 ? 'Next Question' : 'View Summary'}
        </button>
    `;
    
    gameContent.innerHTML = html;
}

function nextBiasQuestion() {
    gameState.currentQuestion++;
    renderBiasSpotter();
}

function showBiasSpotterSummary() {
    const html = `
        <div class="game-summary">
            <h2>Bias Spotter Game - Summary</h2>
            <div style="font-size: 24px; font-weight: 700; color: #3b82f6; margin: 24px 0;">
                Final Score: ${gameState.score} / ${biasSpotterQuestions.length}
            </div>
            ${gameState.results.map((result, index) => `
                <div class="summary-item" style="margin-bottom: 16px;">
                    <strong>Question ${index + 1}:</strong> ${result.isCorrect ? '✅' : '❌'}<br>
                    <small>You selected: ${result.selected} | Correct: ${result.correct}</small><br>
                    <small>${result.explanation}</small>
                </div>
            `).join('')}
        </div>
        <button class="game-button-action" onclick="showAllGamesSummary()">
            Continue to Next Game
        </button>
        <button class="game-button-action" onclick="goBackToMain()" style="background: linear-gradient(135deg, #64748b 0%, #475569 100%); margin-top: 12px;">
            Back to Main
        </button>
    `;
    
    gameContent.innerHTML = html;
}

// Game 2: Calm-or-React
let calmReactTimer = null;
let calmReactStartTime = null;

function startCalmReact() {
    gameState.currentGame = 'calm';
    gameState.currentQuestion = 0;
    gameState.score = 0;
    gameState.results = [];
    if (gameTitle) gameTitle.textContent = "Calm-or-React Game";
    renderCalmReact();
}

function renderCalmReact() {
    if (!gameContent) return;
    
    if (gameState.currentQuestion >= calmReactQuestions.length) {
        showCalmReactSummary();
        return;
    }
    
    const question = calmReactQuestions[gameState.currentQuestion];
    
    const html = `
        <div class="game-scenario" style="background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); border-left: 4px solid #ef4444;">
            <h3>Question ${gameState.currentQuestion + 1} of ${calmReactQuestions.length}</h3>
            <p style="font-size: 20px; font-weight: 700; color: #991b1b; animation: flash 0.5s infinite;">${question.message}</p>
            <p style="margin-top: 16px; color: #78350f; font-weight: 600;">⚠️ Wait 3 seconds before responding!</p>
        </div>
        <div id="calmReactTimer" style="text-align: center; font-size: 48px; font-weight: 700; color: #3b82f6; margin: 32px 0;">
            Wait...
        </div>
        <div id="calmReactButtons" style="display: none;">
            <div class="game-options">
                <div class="game-option" onclick="calmReactAnswer('react')">React Immediately</div>
                <div class="game-option" onclick="calmReactAnswer('wait')">Wait & Think</div>
            </div>
        </div>
        <div style="text-align: center; margin-top: 24px; font-size: 18px; font-weight: 600; color: #3b82f6;">
            Score: ${gameState.score} / ${gameState.currentQuestion}
        </div>
    `;
    
    gameContent.innerHTML = html;
    
    // Start 3-second timer
    let timeLeft = 3;
    calmReactStartTime = Date.now();
    const timerEl = document.getElementById('calmReactTimer');
    const buttonsEl = document.getElementById('calmReactButtons');
    
    calmReactTimer = setInterval(() => {
        timeLeft--;
        if (timerEl) {
            timerEl.textContent = timeLeft > 0 ? `${timeLeft}...` : 'Now you can respond!';
            timerEl.style.color = timeLeft > 0 ? '#ef4444' : '#10b981';
        }
        
        if (timeLeft <= 0) {
            clearInterval(calmReactTimer);
            if (buttonsEl) buttonsEl.style.display = 'block';
        }
    }, 1000);
}

function calmReactAnswer(answer) {
    clearInterval(calmReactTimer);
    
    const question = calmReactQuestions[gameState.currentQuestion];
    const waitTime = (Date.now() - calmReactStartTime) / 1000;
    const waitedEnough = waitTime >= question.waitTime;
    const isCorrect = answer === question.correctAction && waitedEnough;
    
    if (isCorrect) {
        gameState.score++;
    }
    
    gameState.results.push({
        question: question.message,
        answer: answer,
        waitTime: waitTime.toFixed(1),
        waitedEnough: waitedEnough,
        isCorrect: isCorrect
    });
    
    const html = `
        <div class="game-scenario">
            <h3>Question ${gameState.currentQuestion + 1} of ${calmReactQuestions.length}</h3>
            <p>${question.message}</p>
        </div>
        <div class="${isCorrect ? 'game-result' : 'game-bias'}">
            <h3>${isCorrect ? '✅ Good Job!' : '❌ Too Quick!'}</h3>
            <p><strong>Your answer:</strong> ${answer === 'wait' ? 'Wait & Think' : 'React Immediately'}</p>
            <p><strong>Wait time:</strong> ${waitTime.toFixed(1)} seconds</p>
            <p style="margin-top: 12px;">${isCorrect ? 'You waited long enough and made a calm decision. Impulse control is key to good financial decisions!' : 'You reacted too quickly! The goal is to wait 3 seconds before making any decision to avoid impulsive choices.'}</p>
        </div>
        <button class="game-button-action" onclick="nextCalmReactQuestion()">
            ${gameState.currentQuestion < calmReactQuestions.length - 1 ? 'Next Question' : 'View Summary'}
        </button>
    `;
    
    gameContent.innerHTML = html;
}

function nextCalmReactQuestion() {
    gameState.currentQuestion++;
    renderCalmReact();
}

function showCalmReactSummary() {
    // Save current game results
    const gameData = {
        game: 'calm',
        score: gameState.score,
        total: calmReactQuestions.length,
        results: gameState.results,
        timestamp: new Date().toISOString()
    };
    saveGameResult(gameData);
    
    const html = `
        <div class="game-summary">
            <h2>Calm-or-React Game - Summary</h2>
            <div style="font-size: 24px; font-weight: 700; color: #10b981; margin: 24px 0;">
                Final Score: ${gameState.score} / ${calmReactQuestions.length}
            </div>
            ${gameState.results.map((result, index) => `
                <div class="summary-item" style="margin-bottom: 16px;">
                    <strong>Question ${index + 1}:</strong> ${result.isCorrect ? '✅' : '❌'}<br>
                    <small>Wait time: ${result.waitTime}s | ${result.waitedEnough ? 'Waited enough' : 'Too quick!'}</small>
                </div>
            `).join('')}
            <div class="game-perspective" style="margin-top: 24px;">
                <h4>24-Hour Perspective</h4>
                <p>Financial decisions made in haste often lead to regret. By waiting just 3 seconds, you give yourself time to think rationally. In real scenarios, waiting 24 hours before major financial decisions can prevent costly mistakes driven by emotion.</p>
            </div>
        </div>
        <button class="game-button-action" onclick="showAllGamesSummary()">
            Continue to Next Game
        </button>
        <button class="game-button-action" onclick="goBackToMain()" style="background: linear-gradient(135deg, #64748b 0%, #475569 100%); margin-top: 12px;">
            Back to Main
        </button>
    `;
    
    gameContent.innerHTML = html;
}

// Game 3: Yes/No Speed Test
let speedTestTimer = null;
let speedTestStartTime = null;

function startSpeedTest() {
    gameState.currentGame = 'speed';
    gameState.currentQuestion = 0;
    gameState.score = 0;
    gameState.results = [];
    if (gameTitle) gameTitle.textContent = "Yes/No Speed Test";
    renderSpeedTest();
}

function renderSpeedTest() {
    if (!gameContent) return;
    
    if (gameState.currentQuestion >= speedTestQuestions.length) {
        showSpeedTestSummary();
        return;
    }
    
    const question = speedTestQuestions[gameState.currentQuestion];
    
    const html = `
        <div class="game-scenario" style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-left: 4px solid #f59e0b;">
            <h3>Question ${gameState.currentQuestion + 1} of ${speedTestQuestions.length}</h3>
            <p style="font-size: 22px; font-weight: 700; color: #92400e;">${question.prompt}</p>
            <p style="margin-top: 16px; color: #78350f; font-weight: 600;">⚡ Answer quickly! (${question.timeLimit}s limit)</p>
        </div>
        <div id="speedTestTimer" style="text-align: center; font-size: 48px; font-weight: 700; color: #ef4444; margin: 32px 0;">
            ${question.timeLimit}
        </div>
        <div class="game-options" style="flex-direction: row; gap: 16px;">
            <div class="game-option" style="flex: 1; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white;" onclick="speedTestAnswer(true)">
                ✅ YES
            </div>
            <div class="game-option" style="flex: 1; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white;" onclick="speedTestAnswer(false)">
                ❌ NO
            </div>
        </div>
        <div style="text-align: center; margin-top: 24px; font-size: 18px; font-weight: 600; color: #3b82f6;">
            Score: ${gameState.score} / ${gameState.currentQuestion}
        </div>
    `;
    
    gameContent.innerHTML = html;
    
    // Start timer
    let timeLeft = question.timeLimit;
    speedTestStartTime = Date.now();
    const timerEl = document.getElementById('speedTestTimer');
    
    speedTestTimer = setInterval(() => {
        timeLeft--;
        if (timerEl) {
            timerEl.textContent = timeLeft;
            timerEl.style.color = timeLeft <= 1 ? '#ef4444' : '#3b82f6';
        }
        
        if (timeLeft <= 0) {
            clearInterval(speedTestTimer);
            speedTestAnswer(null); // Timeout
        }
    }, 1000);
}

function speedTestAnswer(answer) {
    clearInterval(speedTestTimer);
    
    const question = speedTestQuestions[gameState.currentQuestion];
    const responseTime = (Date.now() - speedTestStartTime) / 1000;
    const wasQuick = responseTime <= question.timeLimit;
    const isCorrect = answer === question.correct;
    const scored = wasQuick && isCorrect;
    
    if (scored) {
        gameState.score++;
    }
    
    gameState.results.push({
        question: question.prompt,
        answer: answer === null ? 'Timeout' : (answer ? 'Yes' : 'No'),
        correct: question.correct ? 'Yes' : 'No',
        responseTime: responseTime.toFixed(4),
        wasQuick: wasQuick,
        isCorrect: isCorrect,
        scored: scored
    });
    
    const html = `
        <div class="game-scenario">
            <h3>Question ${gameState.currentQuestion + 1} of ${speedTestQuestions.length}</h3>
            <p>${question.prompt}</p>
        </div>
        <div class="${scored ? 'game-result' : 'game-bias'}">
            <h3>${answer === null ? '⏱️ Timeout!' : (scored ? '✅ Correct!' : '❌ Incorrect')}</h3>
            <p><strong>Your answer:</strong> ${answer === null ? 'Timeout' : (answer ? 'Yes' : 'No')}</p>
            <p><strong>Correct answer:</strong> ${question.correct ? 'Yes' : 'No'}</p>
            <p><strong>Response time:</strong> ${responseTime.toFixed(2)}s</p>
            <p style="margin-top: 12px;">${answer === null ? 'You took too long! Quick decisions are important, but accuracy matters more.' : (scored ? 'Great! You answered quickly and correctly.' : wasQuick ? 'You answered quickly but incorrectly. Speed without accuracy can be dangerous in finance.' : 'You took too long. Practice making quick but thoughtful decisions.')}</p>
        </div>
        <button class="game-button-action" onclick="nextSpeedTestQuestion()">
            ${gameState.currentQuestion < speedTestQuestions.length - 1 ? 'Next Question' : 'View Summary'}
        </button>
    `;
    
    gameContent.innerHTML = html;
}

function nextSpeedTestQuestion() {
    gameState.currentQuestion++;
    renderSpeedTest();
}

function showSpeedTestSummary() {
    // Save current game results
    const gameData = {
        game: 'speed',
        score: gameState.score,
        total: speedTestQuestions.length,
        results: gameState.results,
        timestamp: new Date().toISOString()
    };
    saveGameResult(gameData);
    
    const avgTime = gameState.results.reduce((sum, r) => sum + parseFloat(r.responseTime), 0) / gameState.results.length;
    const impulsiveCount = gameState.results.filter(r => r.wasQuick && !r.isCorrect).length;
    
    const html = `
        <div class="game-summary">
            <h2>Yes/No Speed Test - Summary</h2>
            <div style="font-size: 24px; font-weight: 700; color: #f59e0b; margin: 24px 0;">
                Final Score: ${gameState.score} / ${speedTestQuestions.length}
            </div>
            <div style="margin: 16px 0;">
                <strong>Average Response Time:</strong> ${avgTime.toFixed(2)}s<br>
                <strong>Impulsive Mistakes:</strong> ${impulsiveCount}
            </div>
            ${gameState.results.map((result, index) => `
                <div class="summary-item" style="margin-bottom: 16px;">
                    <strong>Question ${index + 1}:</strong> ${result.scored ? '✅' : '❌'}<br>
                    <small>You: ${result.answer} | Correct: ${result.correct} | Time: ${result.responseTime}s</small>
                </div>
            `).join('')}
            <div class="game-bias" style="margin-top: 24px;">
                <h4>Detected Pattern</h4>
                <p>${impulsiveCount > 2 ? 'You showed signs of impulsive decision-making. Quick decisions are good, but accuracy is crucial in finance. Take a moment to think before answering.' : 'You balanced speed with accuracy well. Keep practicing to maintain this balance in real financial decisions.'}</p>
            </div>
        </div>
        <button class="game-button-action" onclick="showAllGamesSummary()">
            View Final Summary
        </button>
        <button class="game-button-action" onclick="goBackToMain()" style="background: linear-gradient(135deg, #64748b 0%, #475569 100%); margin-top: 12px;">
            Back to Main
        </button>
    `;
    
    gameContent.innerHTML = html;
}

// Final Summary
let allGamesResults = [];

function showAllGamesSummary() {
    allGamesResults.push({
        game: gameState.currentGame,
        score: gameState.score,
        total: gameState.currentGame === 'bias' ? biasSpotterQuestions.length : 
               gameState.currentGame === 'calm' ? calmReactQuestions.length : 
               speedTestQuestions.length,
        results: gameState.results
    });
    
    // Check if all games completed
    const gamesCompleted = allGamesResults.length;
    const totalGames = 3;
    
    if (gamesCompleted < totalGames) {
        // Show game selection again
        renderGameSelection();
    } else {
        // Show final summary
        showFinalSummary();
    }
}

function showFinalSummary() {
    const totalScore = allGamesResults.reduce((sum, g) => sum + g.score, 0);
    const totalQuestions = allGamesResults.reduce((sum, g) => sum + g.total, 0);
    const percentage = Math.round((totalScore / totalQuestions) * 100);
    
    const html = `
        <div class="game-summary">
            <h2 style="text-align: center; margin-bottom: 32px;">🎉 All Games Complete!</h2>
            <div style="text-align: center; font-size: 36px; font-weight: 700; color: #3b82f6; margin: 32px 0;">
                Overall Score: ${totalScore} / ${totalQuestions} (${percentage}%)
            </div>
            
            ${allGamesResults.map((gameResult, index) => {
                const gameNames = { 'bias': 'Bias Spotter', 'calm': 'Calm-or-React', 'speed': 'Yes/No Speed Test' };
                return `
                    <div class="summary-item" style="margin-bottom: 24px; padding: 20px; background: rgba(59, 130, 246, 0.1); border-radius: 12px;">
                        <h3 style="margin-bottom: 12px;">${gameNames[gameResult.game]}</h3>
                        <p><strong>Score:</strong> ${gameResult.score} / ${gameResult.total}</p>
                    </div>
                `;
            }).join('')}
            
            <div class="game-perspective" style="margin-top: 32px;">
                <h4>24-Hour Perspective</h4>
                <p>After completing these training games, you've learned to:</p>
                <ul style="text-align: left; margin-top: 12px;">
                    <li>Identify common financial biases (Fear, Overconfidence, Herd mentality)</li>
                    <li>Control impulses by waiting before making decisions</li>
                    <li>Balance speed with accuracy in financial choices</li>
                </ul>
                <p style="margin-top: 16px;">Remember: In real financial situations, taking 24 hours to think before major decisions can prevent costly mistakes. Use these skills to make better financial choices!</p>
            </div>
        </div>
        <button class="game-button-action" onclick="startGameSelection()" style="background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%);">
            Play Again
        </button>
        <button class="game-button-action" onclick="hideGame()" style="background: linear-gradient(135deg, #64748b 0%, #475569 100%); margin-top: 12px;">
            Close
        </button>
    `;
    
    gameContent.innerHTML = html;
    
    // Save game results to localStorage
    const gameData = {
        timestamp: new Date().toISOString(),
        results: allGamesResults,
        totalScore: totalScore,
        totalQuestions: totalQuestions,
        percentage: percentage
    };
    
    // Get existing game history
    let gameHistory = JSON.parse(localStorage.getItem('finpsyche_gameHistory') || '[]');
    gameHistory.push(gameData);
    localStorage.setItem('finpsyche_gameHistory', JSON.stringify(gameHistory));
    
    // Add back to main button
    const backButton = document.createElement('button');
    backButton.className = 'game-button-action';
    backButton.style.background = 'linear-gradient(135deg, #64748b 0%, #475569 100%)';
    backButton.style.marginTop = '12px';
    backButton.textContent = 'Back to Main';
    backButton.onclick = goBackToMain;
    gameContent.appendChild(backButton);
    
    allGamesResults = []; // Reset for next play
}

// ===========================
// GAME RESULT STORAGE
// ===========================

function saveGameResult(gameData) {
    let gameResults = JSON.parse(localStorage.getItem('finpsyche_gameResults') || '[]');
    gameResults.push(gameData);
    localStorage.setItem('finpsyche_gameResults', JSON.stringify(gameResults));
}

// ===========================
// REPORT GENERATION
// ===========================

async function generateAndDownloadReport() {
    try {
        // Get game results (current session or previous)
        let gameResults = JSON.parse(localStorage.getItem('finpsyche_gameResults') || '[]');
        let gameHistory = JSON.parse(localStorage.getItem('finpsyche_gameHistory') || '[]');
        
        // Get chat history
        let chatHistory = [];
        try {
            const response = await fetch(`${API_URL}/chat/history/${userId}`, {
                method: "GET",
                headers: { "Content-Type": "application/json" }
            });
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.messages) {
                    chatHistory = data.messages;
                }
            }
        } catch (error) {
            console.error("Error fetching chat history:", error);
        }
        
        // Generate report
        const report = generateReport(gameResults, gameHistory, chatHistory);
        
        // Download as PDF/HTML
        downloadReport(report);
    } catch (error) {
        console.error("Error generating report:", error);
        alert("Error generating report. Please try again.");
    }
}

function generateReport(gameResults, gameHistory, chatHistory) {
    const now = new Date();
    const reportDate = now.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // Analyze game results
    const latestGameSession = gameHistory.length > 0 ? gameHistory[gameHistory.length - 1] : null;
    const biasGameResults = gameResults.filter(r => r.game === 'bias');
    const calmGameResults = gameResults.filter(r => r.game === 'calm');
    const speedGameResults = gameResults.filter(r => r.game === 'speed');
    
    // Calculate personality traits from scores
    const personalityAnalysis = analyzePersonality(gameResults, gameHistory);
    
    // Generate report HTML
    let reportHTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>FinPsyche Personal Report</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 900px;
            margin: 0 auto;
            padding: 40px;
            background: #f5f5f5;
        }
        .header {
            background: linear-gradient(135deg, #10b981 0%, #3b82f6 100%);
            color: white;
            padding: 40px;
            border-radius: 12px;
            margin-bottom: 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0 0 10px 0;
            font-size: 36px;
        }
        .header p {
            margin: 0;
            opacity: 0.9;
        }
        .section {
            background: white;
            padding: 30px;
            margin-bottom: 20px;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .section h2 {
            color: #3b82f6;
            border-bottom: 3px solid #3b82f6;
            padding-bottom: 10px;
            margin-bottom: 20px;
        }
        .section h3 {
            color: #10b981;
            margin-top: 20px;
        }
        .score-box {
            background: linear-gradient(135deg, #e0f2fe 0%, #dbeafe 100%);
            padding: 20px;
            border-radius: 8px;
            margin: 15px 0;
            border-left: 4px solid #3b82f6;
        }
        .personality-box {
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
            padding: 20px;
            border-radius: 8px;
            margin: 15px 0;
            border-left: 4px solid #f59e0b;
        }
        .chat-message {
            padding: 15px;
            margin: 10px 0;
            border-radius: 8px;
        }
        .user-message {
            background: #e0f2fe;
            border-left: 4px solid #3b82f6;
        }
        .bot-message {
            background: #d1fae5;
            border-left: 4px solid #10b981;
        }
        .recommendation {
            background: linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%);
            padding: 20px;
            border-radius: 8px;
            margin: 15px 0;
            border-left: 4px solid #8b5cf6;
        }
        ul {
            padding-left: 20px;
        }
        li {
            margin: 8px 0;
        }
        .footer {
            text-align: center;
            color: #666;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 FinPsyche Personal Report</h1>
        <p>Generated on ${reportDate}</p>
    </div>
    
    <div class="section">
        <h2>🎯 Executive Summary</h2>
        <p>This report analyzes your financial decision-making patterns based on your interactions with FinPsyche's training games and chatbot conversations.</p>
        ${latestGameSession ? `
            <div class="score-box">
                <h3>Latest Game Session Performance</h3>
                <p><strong>Overall Score:</strong> ${latestGameSession.totalScore} / ${latestGameSession.totalQuestions} (${latestGameSession.percentage}%)</p>
                <p><strong>Date:</strong> ${new Date(latestGameSession.timestamp).toLocaleDateString()}</p>
            </div>
        ` : '<p>No game sessions completed yet.</p>'}
    </div>
    
    <div class="section">
        <h2>🧠 Personality Analysis</h2>
        ${personalityAnalysis}
    </div>
    
    ${gameResults.length > 0 || gameHistory.length > 0 ? `
    <div class="section">
        <h2>🎮 Game Performance Analysis</h2>
        ${biasGameResults.length > 0 ? `
            <div class="score-box">
                <h3>Bias Spotter Game</h3>
                <p><strong>Games Played:</strong> ${biasGameResults.length}</p>
                <p><strong>Average Score:</strong> ${(biasGameResults.reduce((sum, r) => sum + r.score, 0) / biasGameResults.length).toFixed(1)} / ${biasGameResults[0]?.total || 5}</p>
                <p>This game tests your ability to identify financial biases (Fear, Overconfidence, Herd mentality).</p>
            </div>
        ` : ''}
        ${calmGameResults.length > 0 ? `
            <div class="score-box">
                <h3>Calm-or-React Game</h3>
                <p><strong>Games Played:</strong> ${calmGameResults.length}</p>
                <p><strong>Average Score:</strong> ${(calmGameResults.reduce((sum, r) => sum + r.score, 0) / calmGameResults.length).toFixed(1)} / ${calmGameResults[0]?.total || 5}</p>
                <p>This game measures your impulse control and ability to wait before making decisions.</p>
            </div>
        ` : ''}
        ${speedGameResults.length > 0 ? `
            <div class="score-box">
                <h3>Yes/No Speed Test</h3>
                <p><strong>Games Played:</strong> ${speedGameResults.length}</p>
                <p><strong>Average Score:</strong> ${(speedGameResults.reduce((sum, r) => sum + r.score, 0) / speedGameResults.length).toFixed(1)} / ${speedGameResults[0]?.total || 5}</p>
                <p>This game evaluates your ability to balance speed with accuracy in financial decisions.</p>
            </div>
        ` : ''}
    </div>
    ` : ''}
    
    ${chatHistory.length > 0 ? `
    <div class="section">
        <h2>💬 Chatbot Conversation Summary</h2>
        <p><strong>Total Messages:</strong> ${chatHistory.length}</p>
        <p><strong>Conversations:</strong> ${new Set(chatHistory.map(m => {
            const date = new Date(m.timestamp);
            return date.toDateString();
        })).size}</p>
        <h3>Recent Conversations:</h3>
        ${chatHistory.slice(-10).map(msg => `
            <div class="chat-message ${msg.sender === 'user' ? 'user-message' : 'bot-message'}">
                <strong>${msg.sender === 'user' ? 'You' : 'FinPsyche'}:</strong> ${msg.text.substring(0, 200)}${msg.text.length > 200 ? '...' : ''}
                ${msg.emotion ? `<br><small>Emotion: ${msg.emotion}</small>` : ''}
                ${msg.personality ? `<br><small>Personality: ${msg.personality}</small>` : ''}
            </div>
        `).join('')}
    </div>
    ` : ''}
    
    <div class="section">
        <h2>💡 Recommendations</h2>
        <div class="recommendation">
            ${generateRecommendations(gameResults, gameHistory, chatHistory)}
        </div>
    </div>
    
    <div class="footer">
        <p>Generated by FinPsyche - AI-Powered Financial Personality Analyzer</p>
        <p>This report is for informational purposes only and should not replace professional financial advice.</p>
    </div>
</body>
</html>
    `;
    
    return reportHTML;
}

function analyzePersonality(gameResults, gameHistory) {
    if (gameResults.length === 0 && gameHistory.length === 0) {
        return '<p>Complete training games to get personality insights.</p>';
    }
    
    let biasScore = 0, calmScore = 0, speedScore = 0;
    let biasCount = 0, calmCount = 0, speedCount = 0;
    
    gameResults.forEach(result => {
        if (result.game === 'bias') {
            biasScore += (result.score / result.total) * 100;
            biasCount++;
        } else if (result.game === 'calm') {
            calmScore += (result.score / result.total) * 100;
            calmCount++;
        } else if (result.game === 'speed') {
            speedScore += (result.score / result.total) * 100;
            speedCount++;
        }
    });
    
    const avgBias = biasCount > 0 ? biasScore / biasCount : 0;
    const avgCalm = calmCount > 0 ? calmScore / calmCount : 0;
    const avgSpeed = speedCount > 0 ? speedScore / speedCount : 0;
    
    let personality = '';
    let traits = [];
    
    if (avgBias >= 80) {
        traits.push('Strong bias recognition');
        personality += '<p><strong>Bias Awareness:</strong> Excellent - You have a strong ability to identify financial biases.</p>';
    } else if (avgBias >= 60) {
        traits.push('Moderate bias recognition');
        personality += '<p><strong>Bias Awareness:</strong> Good - You can identify most biases but could improve with practice.</p>';
    } else {
        traits.push('Needs improvement in bias recognition');
        personality += '<p><strong>Bias Awareness:</strong> Developing - Practice identifying biases to make better decisions.</p>';
    }
    
    if (avgCalm >= 80) {
        traits.push('Excellent impulse control');
        personality += '<p><strong>Impulse Control:</strong> Excellent - You demonstrate strong self-control in financial decisions.</p>';
    } else if (avgCalm >= 60) {
        traits.push('Moderate impulse control');
        personality += '<p><strong>Impulse Control:</strong> Good - You generally wait before making decisions but could improve.</p>';
    } else {
        traits.push('Needs improvement in impulse control');
        personality += '<p><strong>Impulse Control:</strong> Developing - Practice waiting before making financial decisions.</p>';
    }
    
    if (avgSpeed >= 80) {
        traits.push('Balanced speed and accuracy');
        personality += '<p><strong>Decision Speed:</strong> Excellent - You balance quick decisions with accuracy well.</p>';
    } else if (avgSpeed >= 60) {
        traits.push('Moderate decision speed');
        personality += '<p><strong>Decision Speed:</strong> Good - You make timely decisions but could improve accuracy.</p>';
    } else {
        traits.push('Needs improvement in decision speed');
        personality += '<p><strong>Decision Speed:</strong> Developing - Practice making quicker but accurate decisions.</p>';
    }
    
    return `
        <div class="personality-box">
            <h3>Your Financial Personality Profile</h3>
            ${personality}
            <h3>Key Traits:</h3>
            <ul>
                ${traits.map(trait => `<li>${trait}</li>`).join('')}
            </ul>
        </div>
    `;
}

function generateRecommendations(gameResults, gameHistory, chatHistory) {
    let recommendations = [];
    
    if (gameResults.length === 0) {
        recommendations.push('Complete the training games to get personalized recommendations.');
    } else {
        const biasResults = gameResults.filter(r => r.game === 'bias');
        const calmResults = gameResults.filter(r => r.game === 'calm');
        const speedResults = gameResults.filter(r => r.game === 'speed');
        
        if (biasResults.length > 0) {
            const avgBias = biasResults.reduce((sum, r) => sum + (r.score / r.total), 0) / biasResults.length;
            if (avgBias < 0.6) {
                recommendations.push('Focus on learning to identify financial biases. Practice recognizing Fear, Overconfidence, and Herd mentality in your decisions.');
            }
        }
        
        if (calmResults.length > 0) {
            const avgCalm = calmResults.reduce((sum, r) => sum + (r.score / r.total), 0) / calmResults.length;
            if (avgCalm < 0.6) {
                recommendations.push('Practice impulse control. Wait at least 24 hours before making major financial decisions.');
            }
        }
        
        if (speedResults.length > 0) {
            const avgSpeed = speedResults.reduce((sum, r) => sum + (r.score / r.total), 0) / speedResults.length;
            if (avgSpeed < 0.6) {
                recommendations.push('Work on balancing speed with accuracy. Quick decisions are good, but accuracy is crucial in finance.');
            }
        }
    }
    
    if (chatHistory.length > 0) {
        const emotions = chatHistory.filter(m => m.emotion).map(m => m.emotion);
        const stressCount = emotions.filter(e => e.toLowerCase().includes('stress') || e.toLowerCase().includes('anxiety')).length;
        if (stressCount > emotions.length * 0.3) {
            recommendations.push('You show signs of financial stress. Consider speaking with a financial advisor and reviewing your risk tolerance.');
        }
    }
    
    if (recommendations.length === 0) {
        recommendations.push('Continue practicing with the training games to maintain your skills.');
        recommendations.push('Regularly review your financial decisions and learn from them.');
        recommendations.push('Consider consulting with a financial advisor for personalized guidance.');
    }
    
    return '<ul>' + recommendations.map(r => `<li>${r}</li>`).join('') + '</ul>';
}

function downloadReport(reportHTML) {
    const blob = new Blob([reportHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FinPsyche_Report_${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}