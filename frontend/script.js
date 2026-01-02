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

// Initialize
document.addEventListener("DOMContentLoaded", () => {
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
    
    // Game button
    if (gameBtn) {
        gameBtn.addEventListener("click", () => {
            showGame();
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
// GAME FUNCTIONS
// ===========================

const gameScenarios = [
    {
        scenario: "Market drops 5% today. What do you do?",
        options: [
            { text: "A) Panic sell everything", bias: "Fear Bias", action: "Sell" },
            { text: "B) Hold and wait", bias: "Patience", action: "Wait" },
            { text: "C) Buy more at discount", bias: "Opportunistic", action: "Buy" }
        ],
        perspective24h: "After 24 hours, the market recovered 3%. Those who panicked sold at a loss. Those who held or bought more saw gains. Emotional decisions often lead to poor outcomes.",
        calmAction: "Wait 24 hours before making major decisions. Review your long-term strategy. Market volatility is normal."
    },
    {
        scenario: "You see a 'hot' stock tip on social media. It's up 50% today. What do you do?",
        options: [
            { text: "A) Buy immediately", bias: "FOMO (Fear of Missing Out)", action: "Buy" },
            { text: "B) Research first, then decide", bias: "Rational Analysis", action: "Wait" },
            { text: "C) Ignore it completely", bias: "Conservative", action: "Wait" }
        ],
        perspective24h: "After 24 hours, the stock dropped 30%. Social media tips are often too late. The smart investors researched and avoided the trap.",
        calmAction: "Never invest based on social media tips alone. Always research. If it sounds too good to be true, it usually is."
    },
    {
        scenario: "Your portfolio is down 10% this month. You're feeling anxious. What do you do?",
        options: [
            { text: "A) Sell everything to stop losses", bias: "Loss Aversion", action: "Sell" },
            { text: "B) Rebalance and hold", bias: "Strategic Thinking", action: "Wait" },
            { text: "C) Buy more to average down", bias: "Contrarian", action: "Buy" }
        ],
        perspective24h: "After 24 hours of reflection, you realize 10% monthly swings are normal. Selling in panic locks in losses. Rebalancing maintains your strategy.",
        calmAction: "Review your risk tolerance. If 10% swings cause panic, consider a more conservative allocation. Don't make decisions when emotional."
    }
];

let currentGameState = {
    scenarioIndex: 0,
    selectedOption: null,
    showResult: false,
    showPerspective: false,
    showSummary: false
};

function showGame() {
    currentGameState = {
        scenarioIndex: 0,
        selectedOption: null,
        showResult: false,
        showPerspective: false,
        showSummary: false
    };
    
    if (gameModal) {
        gameModal.style.display = 'flex';
    }
    
    renderGame();
}

function hideGame() {
    if (gameModal) {
        gameModal.style.display = 'none';
    }
}

function renderGame() {
    if (!gameContent) return;
    
    const scenario = gameScenarios[currentGameState.scenarioIndex];
    
    let html = `
        <div class="game-scenario">
            <h3>Scenario ${currentGameState.scenarioIndex + 1}</h3>
            <p>${scenario.scenario}</p>
        </div>
    `;
    
    if (!currentGameState.showResult) {
        html += `
            <div class="game-options">
                ${scenario.options.map((option, index) => `
                    <div class="game-option ${currentGameState.selectedOption === index ? 'selected' : ''}" 
                         onclick="selectOption(${index})">
                        ${option.text}
                    </div>
                `).join('')}
            </div>
            <button class="game-button-action" onclick="submitGameChoice()" ${!currentGameState.selectedOption && currentGameState.selectedOption !== 0 ? 'disabled style="opacity: 0.5"' : ''}>
                Submit Choice
            </button>
        `;
    } else {
        const selectedOption = scenario.options[currentGameState.selectedOption];
        
        html += `
            <div class="game-result">
                <h3>Your Choice</h3>
                <p><strong>${selectedOption.text}</strong></p>
                <p>Action: ${selectedOption.action}</p>
            </div>
            
            <div class="game-bias">
                <h4>Detected Bias</h4>
                <p><strong>${selectedOption.bias}</strong></p>
                <p>This choice reveals ${selectedOption.bias.toLowerCase()}. Emotional decisions under pressure often lead to suboptimal outcomes.</p>
            </div>
        `;
        
        if (currentGameState.showPerspective) {
            html += `
                <div class="game-perspective">
                    <h4>24-Hour Delayed Perspective</h4>
                    <p>${scenario.perspective24h}</p>
                </div>
            `;
            
            if (currentGameState.showSummary) {
                html += `
                    <div class="game-summary">
                        <h4>Final Summary</h4>
                        <div class="summary-item">
                            <strong>Immediate Decision:</strong> ${selectedOption.action}
                        </div>
                        <div class="summary-item">
                            <strong>Detected Bias:</strong> ${selectedOption.bias}
                        </div>
                        <div class="summary-item">
                            <strong>Suggested Calm Action:</strong> ${scenario.calmAction}
                        </div>
                    </div>
                    <button class="game-button-action" onclick="nextGameScenario()">
                        ${currentGameState.scenarioIndex < gameScenarios.length - 1 ? 'Next Scenario' : 'Play Again'}
                    </button>
                `;
            } else {
                html += `
                    <button class="game-button-action" onclick="showGameSummary()">
                        Show Summary
                    </button>
                `;
            }
        } else {
            html += `
                <button class="game-button-action" onclick="show24HourPerspective()">
                    See 24-Hour Perspective
                </button>
            `;
        }
    }
    
    gameContent.innerHTML = html;
}

function selectOption(index) {
    currentGameState.selectedOption = index;
    renderGame();
}

function submitGameChoice() {
    if (currentGameState.selectedOption === null) return;
    currentGameState.showResult = true;
    renderGame();
    
    // Send game result to chatbot for analysis
    const scenario = gameScenarios[currentGameState.scenarioIndex];
    const selectedOption = scenario.options[currentGameState.selectedOption];
    sendGameResultToChatbot(scenario, selectedOption);
}

function show24HourPerspective() {
    currentGameState.showPerspective = true;
    renderGame();
}

function showGameSummary() {
    currentGameState.showSummary = true;
    renderGame();
}

function nextGameScenario() {
    if (currentGameState.scenarioIndex < gameScenarios.length - 1) {
        currentGameState.scenarioIndex++;
        currentGameState.selectedOption = null;
        currentGameState.showResult = false;
        currentGameState.showPerspective = false;
        currentGameState.showSummary = false;
    } else {
        // Reset to first scenario
        currentGameState.scenarioIndex = 0;
        currentGameState.selectedOption = null;
        currentGameState.showResult = false;
        currentGameState.showPerspective = false;
        currentGameState.showSummary = false;
    }
    renderGame();
}

async function sendGameResultToChatbot(scenario, selectedOption) {
    // Integrate game result with chatbot
    const gameMessage = `I just played the financial decision game. Scenario: "${scenario.scenario}" I chose: "${selectedOption.text}" which shows ${selectedOption.bias}. Can you help me understand this better and provide advice?`;
    
    // Add message to chat
    addMessage(gameMessage, "user");
    showTyping();
    
    try {
        const response = await fetch(`${API_URL}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: gameMessage, user_id: userId })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        hideTyping();

        const botMessage = data.reply || data.response || "I'm here to help with your financial questions.";
        
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

        addMessage(displayText, "bot");

        if (data.personality) {
            updatePersonalityBadge(data.personality);
        }

        if (data.audio_url) {
            playAudio(`${API_URL}${data.audio_url}`);
        }
    } catch (error) {
        hideTyping();
        addMessage("Sorry, I'm having trouble connecting. Please try again.", "bot");
        console.error("Error:", error);
    }
}