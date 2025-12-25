const API_URL = 'http://localhost:5000';
let userId = Math.floor(Math.random() * 1000000);

// DOM elements
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const typingIndicator = document.getElementById('typingIndicator');
const personalityBadge = document.getElementById('personalityBadge');
const personalityValue = document.getElementById('personalityValue');

console.log(`User ID: ${userId}`);

// Send message function
async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    // Add user message to chat
    addMessage(message, 'user');
    messageInput.value = '';
    
    // Show typing indicator
    showTypingIndicator();
    
    try {
        const response = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                user_id: userId
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        // Hide typing indicator
        hideTypingIndicator();
        
        // Add bot response
        addMessage(data.reply, 'bot', data.personality, data.emotion);
        
        // Update personality badge
        if (data.personality) {
            updatePersonalityBadge(data.personality);
        }
        
    } catch (error) {
        hideTypingIndicator();
        addMessage('Sorry, I encountered an error. Please make sure the backend is running.', 'bot');
        console.error('Error:', error);
    }
}

// Add message to chat
function addMessage(text, sender, personality = null, emotion = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    const textP = document.createElement('p');
    textP.textContent = text;
    contentDiv.appendChild(textP);
    
    // Add metadata badges for bot messages
    if (sender === 'bot' && (personality || emotion)) {
        const metaDiv = document.createElement('div');
        metaDiv.className = 'message-meta';
        
        if (personality) {
            const personalityBadge = document.createElement('span');
            personalityBadge.className = 'meta-badge personality-meta';
            personalityBadge.textContent = `Personality: ${personality}`;
            metaDiv.appendChild(personalityBadge);
        }
        
        if (emotion) {
            const emotionBadge = document.createElement('span');
            emotionBadge.className = 'meta-badge emotion-meta';
            emotionBadge.textContent = `Emotion: ${emotion}`;
            metaDiv.appendChild(emotionBadge);
        }
        
        contentDiv.appendChild(metaDiv);
    }
    
    messageDiv.appendChild(contentDiv);
    
    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = new Date().toLocaleTimeString();
    messageDiv.appendChild(timeDiv);
    
    chatMessages.appendChild(messageDiv);
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Show typing indicator
function showTypingIndicator() {
    typingIndicator.style.display = 'flex';
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Hide typing indicator
function hideTypingIndicator() {
    typingIndicator.style.display = 'none';
}

// Update personality badge
function updatePersonalityBadge(personality) {
    personalityValue.textContent = personality;
    personalityBadge.style.display = 'block';
}

// Enter key to send
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Focus input on load
messageInput.focus();