from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import whisper, os, tempfile, time, re
from werkzeug.utils import secure_filename
from pydub import AudioSegment
import pyttsx3

from models.emotion_model import EmotionModel
from models.personality_model import PersonalityModel
from db import save_to_db, get_chat_history
from rag.rag_engine import setup_rag, retrieve_advice

app = Flask(__name__)

CORS(
    app,
    resources={
        r"/chat/*": {
            "origins": [
                "http://localhost:5501",
                "http://127.0.0.1:5501"
            ]
        },
        r"/audio/*": {
            "origins": "*"
        }
    }
)


# ---------------- LOAD MODELS ----------------
emotion_model = EmotionModel()
personality_model = PersonalityModel()
vectorstore = setup_rag()
whisper_model = whisper.load_model("base")

# ---------------- TTS ----------------
tts_engine = pyttsx3.init()
tts_engine.setProperty("rate", 150)

# ---------------- SPEECH → TEXT ----------------
def speech_to_text(audio_path):
    result = whisper_model.transcribe(audio_path)
    return result["text"].strip()

# ---------------- DETECT GREETINGS AND CASUAL MESSAGES ----------------  
def is_greeting_or_casual(message):
    """
    Detect if the message is a greeting, casual response, or non-financial query.
    Returns True if it's a greeting/casual message, False if it's a financial query.
    """
    if not message:
        return True
    
    message_lower = message.lower().strip()
    
    # Greetings
    greetings = [
        'hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening',
        'greetings', 'hi there', 'hello there', 'hey there'
    ]
    
    # Casual responses
    casual_responses = [
        'ok', 'okay', 'thanks', 'thank you', 'ok thanks', 'okay thanks',
        'alright', 'sure', 'got it', 'understood', 'cool', 'nice',
        'bye', 'goodbye', 'see you', 'see ya', 'later', 'thanks bye',
        'no problem', 'no worries', 'you\'re welcome', 'welcome'
    ]
    
    # Check if message is just a greeting or casual response
    if message_lower in greetings or message_lower in casual_responses:
        return True
    
    # Check if message starts with greeting
    for greeting in greetings:
        if message_lower.startswith(greeting):
            return True
    
    # Check if message is very short and doesn't contain financial keywords
    financial_keywords = [
        'invest', 'money', 'saving', 'spend', 'budget', 'financial', 'finance',
        'stock', 'mutual fund', 'sip', 'fd', 'ppf', 'retirement', 'portfolio',
        'risk', 'return', 'income', 'expense', 'debt', 'loan', 'credit',
        'asset', 'wealth', 'rich', 'poor', 'earn', 'salary', 'pension'
    ]
    
    # If message is short and has no financial keywords, it's likely casual
    if len(message_lower.split()) <= 3:
        has_financial_keyword = any(keyword in message_lower for keyword in financial_keywords)
        if not has_financial_keyword:
            return True
    
    return False

# ---------------- GENERATE APPROPRIATE RESPONSE ----------------  
def generate_response(message, personality, emotion, context, is_casual=False):
    """
    Generate appropriate response based on message type.
    For greetings/casual: friendly response
    For financial queries: financial advice
    """
    if is_casual:
        # Generate friendly, conversational response
        casual_responses = {
            'greeting': [
                "Hello! I'm here to help with your financial questions. What would you like to know?",
                "Hi there! Ready to discuss your finances? Feel free to ask me anything!",
                "Hey! I'm your financial advisor. How can I assist you today?"
            ],
            'thanks': [
                "You're welcome! Feel free to ask if you have any more financial questions.",
                "Happy to help! Let me know if you need any other financial advice.",
                "Anytime! I'm here whenever you need financial guidance."
            ],
            'ok': [
                "Got it! If you have any financial questions, just ask.",
                "Understood! Feel free to reach out with any financial concerns.",
                "Sure thing! I'm here to help with your financial planning."
            ]
        }
        
        message_lower = message.lower().strip()
        
        # Determine response type
        if any(word in message_lower for word in ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening']):
            response_text = casual_responses['greeting'][0]
        elif any(word in message_lower for word in ['thanks', 'thank you']):
            response_text = casual_responses['thanks'][0]
        elif any(word in message_lower for word in ['ok', 'okay', 'alright', 'sure', 'got it']):
            response_text = casual_responses['ok'][0]
        else:
            response_text = "I'm here to help with your financial questions. What would you like to know?"
        
        return response_text
    else:
        # Generate personalized financial advice response
        message_lower = message.lower().strip()
        
        # Combine all context for comprehensive advice
        all_context = ' '.join(context) if context else ''
        
        # Extract key information from user's question
        is_about_stocks = any(word in message_lower for word in ['stock', 'stocks', 'equity', 'equities', 'invest', 'investment', 'investing'])
        is_about_savings = any(word in message_lower for word in ['save', 'saving', 'savings', 'money', 'cash'])
        is_about_debt = any(word in message_lower for word in ['debt', 'loan', 'credit', 'owe', 'borrow'])
        is_about_budget = any(word in message_lower for word in ['budget', 'spending', 'expense', 'expenses'])
        
        # Build personalized response based on question and context
        response_parts = []
        
        # Address the specific question
        if is_about_stocks:
            personality_type = personality.get('type', '').lower() if personality else ''
            emotion_type = emotion.get('emotion', '').lower() if emotion else ''
            is_stressed = emotion_type in ['stress', 'stressed', 'anxiety', 'anxious', 'fear', 'fearful', 'worry', 'worried']
            is_risk_taker = 'risk' in personality_type or 'taker' in personality_type
            
            if is_risk_taker and is_stressed:
                # Risk taker but currently stressed - acknowledge stress but leverage risk tolerance
                response_parts.append("Yes, you can invest in stocks! Even though you're feeling stressed, your risk-taking personality suggests you can handle market volatility.")
                response_parts.append("However, given your current stress, I'd recommend a structured approach: allocate 70% to diversified stocks (mix of large-cap, mid-cap, and international), 20% to bonds, and 10% to cash reserves.")
                response_parts.append("Consider index funds or ETFs for broad diversification with lower individual stock risk.")
                response_parts.append("Start by investing a portion of your money (maybe 30-50% of what you're comfortable investing), and gradually increase as you become more comfortable.")
                response_parts.append("Remember: only invest money you won't need for at least 5 years, and maintain an emergency fund separate from investments.")
            elif is_risk_taker:
                # Risk taker - can handle more aggressive approach but still need structure
                response_parts.append("Yes, absolutely! As someone comfortable with risk, you can allocate more to stocks while still maintaining balance.")
                response_parts.append("Consider 70-80% in diversified stocks (mix of large-cap, mid-cap, and international), 15-20% in bonds, and 5-10% cash.")
                response_parts.append("Diversify across sectors and consider both growth and value stocks.")
                response_parts.append("Even risk-takers benefit from having an emergency fund and some bonds for stability during market downturns.")
            elif is_stressed:
                # User is stressed about stocks - provide calming, structured advice
                response_parts.append("Yes, you can invest in stocks, but given your current stress level, I'd recommend a more conservative, balanced approach.")
                response_parts.append("Start with a diversified portfolio: 50-60% stocks, 30-40% bonds, 10% cash reserves.")
                response_parts.append("Consider index funds or ETFs for lower risk and better diversification.")
                response_parts.append("Only invest money you won't need for at least 5 years, and start with a smaller percentage of your total savings to reduce stress.")
                response_parts.append("You can always increase your stock allocation as you become more comfortable with market fluctuations.")
            else:
                # Conservative or balanced approach
                response_parts.append("Yes, you can invest in stocks, and it's a great way to grow your wealth over time.")
                response_parts.append("Start with a diversified portfolio: consider 50-60% in stocks (via index funds or ETFs), 30-40% in bonds, and 10% in cash.")
                response_parts.append("Only invest money you can afford to leave invested for 5+ years, as stocks can be volatile in the short term.")
                response_parts.append("Consider starting with low-cost index funds for broad market exposure with lower risk.")
            
            # Add context-based advice if available
            if all_context:
                cleaned_context = clean_financial_advice(all_context)
                if cleaned_context and len(cleaned_context) > 50:
                    response_parts.append(f"\nAdditional guidance: {cleaned_context[:300]}")
        
        elif is_about_savings:
            response_parts.append("Great that you're thinking about saving and investing!")
            if all_context:
                cleaned_context = clean_financial_advice(all_context)
                if cleaned_context:
                    response_parts.append(cleaned_context[:400])
            else:
                response_parts.append("A good rule is to save 20% of your income. Build an emergency fund first (3-6 months expenses), then invest the rest in a diversified portfolio.")
        
        elif is_about_debt:
            response_parts.append("Managing debt is crucial for financial health.")
            if all_context:
                cleaned_context = clean_financial_advice(all_context)
                if cleaned_context:
                    response_parts.append(cleaned_context[:400])
            else:
                response_parts.append("Prioritize high-interest debt first. Consider the debt avalanche method: pay minimums on all debts, then put extra money toward the highest interest rate debt.")
        
        elif is_about_budget:
            response_parts.append("Creating and sticking to a budget is essential.")
            if all_context:
                cleaned_context = clean_financial_advice(all_context)
                if cleaned_context:
                    response_parts.append(cleaned_context[:400])
            else:
                response_parts.append("Use the 50/30/20 rule: 50% for needs, 30% for wants, 20% for savings and debt repayment. Track your expenses for a month to see where your money goes.")
        
        else:
            # Generic financial question - use context if available
            if all_context:
                cleaned_context = clean_financial_advice(all_context)
                if cleaned_context and len(cleaned_context) > 50:
                    response_parts.append(cleaned_context[:400])
                else:
                    response_parts.append("I understand your question. Let me provide some general financial guidance: diversify your investments, maintain an emergency fund, and invest for the long term. For more specific advice, could you provide more details about your situation?")
            else:
                response_parts.append("I'd be happy to help with your financial question. Could you provide more specific details? For example, are you asking about investing, saving, budgeting, or managing debt?")
        
        # Combine response parts
        financial_advice_text = ' '.join(response_parts) if response_parts else 'Invest calmly and diversify.'
        
        # Clean the final advice
        financial_advice_text = clean_financial_advice(financial_advice_text)
        
        # Debug: print what we generated
        print(f"🔍 Generated personalized advice: {financial_advice_text[:200]}...")
        
        return financial_advice_text

# ---------------- CLEAN FINANCIAL ADVICE TEXT ----------------  
def clean_financial_advice(advice_text):
    """
    Clean financial advice text to remove any metadata or extra content.
    Extracts only the actual advice content.
    """
    if not advice_text:
        return "Please consult with a financial advisor for personalized advice."
    
    try:
        text = advice_text.strip()
        original_text = text
        
        # Method 1: If it's CSV format (comma-separated), extract the last column
        if ',' in text and not text.startswith('"') and 'personality_type' in text.lower():
            # CSV format: personality_type,emotion,financial_advice
            parts = text.split(',')
            if len(parts) >= 3:
                # Last part should be financial_advice (might have quotes)
                text = parts[-1].strip().strip('"').strip("'")
                print(f"📋 Extracted from CSV format: {text[:100]}...")
        
        # Method 2: If it contains "financial_advice:" label, extract after it
        if 'financial_advice' in text.lower() and ':' in text:
            # Try different variations
            patterns = [
                r'financial_advice\s*:\s*(.+?)(?:\n|personality_type|emotion|$)',
                r'financial_advice\s*:\s*(.+)',
            ]
            for pattern in patterns:
                match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
                if match:
                    text = match.group(1).strip()
                    print(f"📋 Extracted using pattern: {text[:100]}...")
                    break
        
        # Method 3: Remove all metadata patterns aggressively
        # Remove "personality_type: X" anywhere
        text = re.sub(r'personality_type\s*:\s*[^,\n]+', '', text, flags=re.IGNORECASE)
        # Remove "emotion: X" anywhere
        text = re.sub(r'emotion\s*:\s*[^,\n]+', '', text, flags=re.IGNORECASE)
        # Remove "financial_advice:" label
        text = re.sub(r'financial_advice\s*:\s*', '', text, flags=re.IGNORECASE)
        # Remove "I understand:" patterns
        text = re.sub(r'i\s+understand\s*:.*?(?:\n|$)', '', text, flags=re.IGNORECASE)
        
        # Remove lines that are purely metadata
        lines = text.split('\n')
        cleaned_lines = []
        for line in lines:
            line_stripped = line.strip()
            line_lower = line_stripped.lower()
            
            # Skip empty lines and metadata lines
            if (not line_stripped or
                line_lower.startswith('personality_type') or 
                line_lower.startswith('emotion') or
                line_lower.startswith('i understand') or
                (line_lower.startswith('financial_advice') and ':' in line_lower and len(line_stripped.split(':', 1)[1].strip()) < 5)):
                continue
            
            # Clean remaining metadata from line
            cleaned_line = line_stripped
            cleaned_line = re.sub(r'personality_type\s*:\s*[^,\n\s]+', '', cleaned_line, flags=re.IGNORECASE)
            cleaned_line = re.sub(r'emotion\s*:\s*[^,\n\s]+', '', cleaned_line, flags=re.IGNORECASE)
            cleaned_line = re.sub(r'financial_advice\s*:\s*', '', cleaned_line, flags=re.IGNORECASE)
            cleaned_line = cleaned_line.strip()
            
            if cleaned_line and len(cleaned_line) > 5:
                cleaned_lines.append(cleaned_line)
        
        # Join and final cleanup
        cleaned_text = ' '.join(cleaned_lines).strip()
        
        # Remove quotes
        cleaned_text = cleaned_text.strip('"').strip("'").strip()
        
        # Remove any remaining metadata words at the start
        cleaned_text = re.sub(r'^(personality_type|emotion|financial_advice)\s*:\s*', '', cleaned_text, flags=re.IGNORECASE)
        cleaned_text = cleaned_text.strip()
        
        # Remove standalone metadata words
        cleaned_text = re.sub(r'\b(personality_type|emotion|financial_advice)\s*:\s*', '', cleaned_text, flags=re.IGNORECASE)
        cleaned_text = cleaned_text.strip()
        
        # Final validation
        if cleaned_text and len(cleaned_text) > 10:
            # Make sure it doesn't start with metadata
            if not cleaned_text.lower().startswith(('personality', 'emotion', 'financial_advice', 'i understand')):
                print(f"✅ Final cleaned advice: {cleaned_text[:150]}...")
                return cleaned_text
        
        # If cleaning removed everything, try to extract from original
        print(f"⚠️  Cleaning removed too much, trying original extraction...")
        # Try to find the longest sentence that doesn't contain metadata
        sentences = re.split(r'[.!?]\s+', original_text)
        for sentence in reversed(sentences):
            sentence = sentence.strip()
            if (sentence and 
                len(sentence) > 20 and
                'personality_type' not in sentence.lower() and
                'emotion' not in sentence.lower() and
                not sentence.lower().startswith('financial_advice')):
                print(f"✅ Extracted sentence: {sentence[:150]}...")
                return sentence
        
        # Ultimate fallback
        return "Please consult with a financial advisor for personalized advice."
        
    except Exception as e:
        print(f"❌ Error cleaning advice: {e}")
        import traceback
        traceback.print_exc()
        return "Please consult with a financial advisor for personalized advice."

# ---------------- EXTRACT FINANCIAL ADVICE ----------------  
def extract_financial_advice(reply_text):
    """
    Extract only the financial advice part from the reply text.
    Returns just the advice content without the metadata.
    """
    try:
        # Find the financial_advice line (case-insensitive, handle variations)
        lines = reply_text.split('\n')
        
        for line in lines:
            line_lower = line.lower().strip()
            # Look for financial_advice line specifically
            if 'financial_advice' in line_lower and ':' in line:
                # Extract everything after "financial_advice:"
                # Handle both "financial_advice:" and "financial_advice :" (with space)
                if 'financial_advice:' in line:
                    advice = line.split('financial_advice:', 1)[1].strip()
                elif 'financial_advice :' in line:
                    advice = line.split('financial_advice :', 1)[1].strip()
                else:
                    # Fallback: split on colon and take last part
                    parts = line.split(':', 1)
                    if len(parts) > 1:
                        advice = parts[1].strip()
                    else:
                        continue
                
                if advice:  # Only return if we got actual advice
                    print(f"✅ Extracted advice: {advice[:100]}...")
                    return advice
        
        # If not found, try to extract from the last line that's not metadata
        for line in reversed(lines):
            line_stripped = line.strip()
            if (line_stripped and 
                not line_stripped.lower().startswith('i understand:') and 
                'personality_type' not in line_stripped.lower() and 
                'emotion' not in line_stripped.lower() and
                'financial_advice' not in line_stripped.lower()):
                print(f"⚠️  Using fallback line: {line_stripped[:100]}...")
                return line_stripped
        
        # Ultimate fallback
        print("⚠️  No advice found, using default message")
        return "Please consult with a financial advisor for personalized advice."
    except Exception as e:
        print(f"❌ Error extracting advice: {e}")
        print(f"Reply text was: {reply_text[:200]}...")
        return "Please consult with a financial advisor for personalized advice."

# ---------------- TEXT → SPEECH (MP3) ----------------  
def text_to_speech(text):
    # Generate WAV using pyttsx3
    wav_path = None
    try:
        # Create temp WAV file
        fd, wav_path = tempfile.mkstemp(suffix=".wav")
        os.close(fd)  # Close file descriptor so pyttsx3 can write to it
        
        # Save speech to file (this is async, so we need to wait)
        tts_engine.save_to_file(text, wav_path)
        tts_engine.runAndWait()
        
        # Wait a bit to ensure file is fully written
        time.sleep(0.5)
        
        # Verify WAV file exists and has content
        if not os.path.exists(wav_path):
            raise Exception("WAV file was not created")
        
        file_size = os.path.getsize(wav_path)
        if file_size == 0:
            raise Exception("WAV file is empty")
        
        print(f"✅ WAV file created: {wav_path} ({file_size} bytes)")
        
        # Try to convert WAV → MP3 (browser-safe)
        mp3_path = wav_path.replace(".wav", ".mp3")
        try:
            audio = AudioSegment.from_wav(wav_path)
            audio.export(mp3_path, format="mp3")
            
            # Verify MP3 was created
            if os.path.exists(mp3_path) and os.path.getsize(mp3_path) > 0:
                # Clean up WAV file
                try:
                    os.unlink(wav_path)
                except:
                    pass
                print(f"✅ MP3 file created: {mp3_path}")
                return mp3_path
            else:
                raise Exception("MP3 conversion failed - file not created or empty")
                
        except Exception as conv_error:
            print(f"⚠️  MP3 conversion failed: {conv_error}, returning WAV instead")
            # If MP3 conversion fails, return WAV (browsers can play WAV)
            return wav_path
            
    except Exception as e:
        # Clean up on error
        if wav_path and os.path.exists(wav_path):
            try:
                os.unlink(wav_path)
            except:
                pass
        print(f"❌ Text-to-speech error: {e}")
        raise Exception(f"Could not generate speech: {str(e)}")

# ---------------- VOICE CHAT ----------------
@app.route("/chat/voice", methods=["POST"])
def chat_voice():
    if "audio" not in request.files:
        return jsonify({"error": "Audio file missing"}), 400

    audio = request.files["audio"]
    user_id = request.form.get("user_id", 1)

    # Preserve original extension (.webm)
    filename = secure_filename(audio.filename)
    ext = os.path.splitext(filename)[1] or ".webm"

    fd, audio_path = tempfile.mkstemp(suffix=ext)
    os.close(fd)
    audio.save(audio_path)

    # Transcription
    message = speech_to_text(audio_path)

    emotion = emotion_model.predict(message)
    personality = personality_model.predict(message, emotion)
    save_to_db(user_id, message, emotion, personality, sender='user')

    # Check if message is greeting/casual or financial query
    is_casual = is_greeting_or_casual(message)
    
    if is_casual:
        # For casual messages, provide friendly response
        response_text = generate_response(message, personality, emotion, [], is_casual=True)
        
        reply = f"""I understand: '{message}'

personality_type: {personality['type']}
emotion: {emotion['emotion']}
response: {response_text}
"""
        
        # Save bot response to database
        save_to_db(user_id, response_text, sender='bot')
        
        # Generate audio for the friendly response
        print(f"🎤 Generating audio for casual message: {response_text[:100]}...")
        audio_reply = text_to_speech(response_text)
    else:
        # For financial queries, provide financial advice
        context = retrieve_advice(
            vectorstore,
            message,
            personality["type"],
            emotion["emotion"]
        )

        # Get financial advice
        response_text = generate_response(message, personality, emotion, context, is_casual=False)
        
        # Final cleanup before TTS - ensure no metadata gets through
        audio_text = clean_financial_advice(response_text)
        
        # EXTRA SAFETY: One more pass to remove any remaining metadata
        audio_text = re.sub(r'\b(personality_type|emotion|financial_advice)\s*:\s*[^.!?]*(?=[.!?]|$)', '', audio_text, flags=re.IGNORECASE)
        audio_text = audio_text.strip()
        
        # Verify it's clean before TTS
        if 'personality_type' in audio_text.lower() or 'emotion' in audio_text.lower() or audio_text.lower().startswith('financial_advice'):
            print(f"⚠️  WARNING: Metadata still present in audio text! Cleaning again...")
            audio_text = re.sub(r'.*?financial_advice\s*:\s*', '', audio_text, flags=re.IGNORECASE)
            audio_text = re.sub(r'personality_type\s*:\s*[^.!?]+', '', audio_text, flags=re.IGNORECASE)
            audio_text = re.sub(r'emotion\s*:\s*[^.!?]+', '', audio_text, flags=re.IGNORECASE)
            audio_text = audio_text.strip()
        
        reply = f"""I understand: '{message}'

personality_type: {personality['type']}
emotion: {emotion['emotion']}
financial_advice: {audio_text}
"""

        # Save bot response to database (save the clean audio_text, not the full reply)
        save_to_db(user_id, audio_text, sender='bot')

        # Generate audio for the cleaned financial advice (ONLY the advice content)
        print(f"🎤 FINAL audio text being sent to TTS: {audio_text[:200]}...")
        audio_reply = text_to_speech(audio_text)

    return jsonify({
        "reply": reply,
        "response": reply,  # Also include 'response' for frontend compatibility
        "personality": personality["type"],
        "emotion": emotion["emotion"],
        "transcribed_message": message,
        "audio_url": f"/audio/{os.path.basename(audio_reply)}"
    })

# ---------------- SERVE AUDIO ----------------  
@app.route("/audio/<filename>")
def serve_audio(filename):
    path = os.path.join(tempfile.gettempdir(), filename)
    
    # Determine MIME type based on file extension
    if filename.lower().endswith('.wav'):
        mimetype = 'audio/wav'
    elif filename.lower().endswith('.mp3'):
        mimetype = 'audio/mpeg'
    else:
        mimetype = 'audio/mpeg'  # Default
    
    if os.path.exists(path):
        return send_file(path, mimetype=mimetype)
    else:
        return jsonify({'error': 'Audio file not found'}), 404

# ---------------- TEXT CHAT ----------------  
@app.route("/chat", methods=["POST"])
def chat():
    # Handle both 'message' and 'text' keys for compatibility
    data = request.json or {}
    message = data.get("message") or data.get("text", "")
    user_id = data.get("user_id", 1)
    
    # Validate message
    if not message or not message.strip():
        return jsonify({"error": "Message or text is required"}), 400

    emotion = emotion_model.predict(message)
    personality = personality_model.predict(message, emotion)
    save_to_db(user_id, message, emotion, personality, sender='user')

    # Check if message is greeting/casual or financial query
    is_casual = is_greeting_or_casual(message)
    
    if is_casual:
        # For casual messages, provide friendly response
        response_text = generate_response(message, personality, emotion, [], is_casual=True)
        
        reply = f"""I understand: '{message}'

personality_type: {personality['type']}
emotion: {emotion['emotion']}
response: {response_text}
"""
        
        # Save bot response to database
        save_to_db(user_id, response_text, sender='bot')
        
        # Generate audio for the friendly response
        print(f"🎤 Generating audio for casual message: {response_text[:100]}...")
        audio_reply = text_to_speech(response_text)
    else:
        # For financial queries, provide financial advice
        context = retrieve_advice(
            vectorstore,
            message,
            personality["type"],
            emotion["emotion"]
        )

        # Get financial advice
        response_text = generate_response(message, personality, emotion, context, is_casual=False)
        
        # Final cleanup before TTS - ensure no metadata gets through
        audio_text = clean_financial_advice(response_text)
        
        # EXTRA SAFETY: One more pass to remove any remaining metadata
        audio_text = re.sub(r'\b(personality_type|emotion|financial_advice)\s*:\s*[^.!?]*(?=[.!?]|$)', '', audio_text, flags=re.IGNORECASE)
        audio_text = audio_text.strip()
        
        # Verify it's clean before TTS
        if 'personality_type' in audio_text.lower() or 'emotion' in audio_text.lower() or audio_text.lower().startswith('financial_advice'):
            print(f"⚠️  WARNING: Metadata still present in audio text! Cleaning again...")
            audio_text = re.sub(r'.*?financial_advice\s*:\s*', '', audio_text, flags=re.IGNORECASE)
            audio_text = re.sub(r'personality_type\s*:\s*[^.!?]+', '', audio_text, flags=re.IGNORECASE)
            audio_text = re.sub(r'emotion\s*:\s*[^.!?]+', '', audio_text, flags=re.IGNORECASE)
            audio_text = audio_text.strip()
        
        reply = f"""I understand: '{message}'

personality_type: {personality['type']}
emotion: {emotion['emotion']}
financial_advice: {audio_text}
"""

        # Save bot response to database (save the clean audio_text, not the full reply)
        save_to_db(user_id, audio_text, sender='bot')

        # Generate audio for the cleaned financial advice (ONLY the advice content)
        print(f"🎤 FINAL audio text being sent to TTS: {audio_text[:200]}...")
        audio_reply = text_to_speech(audio_text)

    return jsonify({
        "reply": reply,
        "response": reply,  # Also include 'response' for frontend compatibility
        "personality": personality["type"],
        "emotion": emotion["emotion"],
        "audio_url": f"/audio/{os.path.basename(audio_reply)}"
    })

# ---------------- CHAT HISTORY ----------------  
@app.route("/chat/history/<user_id>", methods=["GET"])
def get_history(user_id):
    """
    Get chat history for a specific user.
    
    Args:
        user_id: User identifier
        
    Returns:
        JSON: List of chat messages with metadata
    """
    try:
        limit = request.args.get('limit', 50, type=int)
        messages = get_chat_history(user_id, limit=limit)
        
        return jsonify({
            "success": True,
            "messages": messages,
            "count": len(messages)
        })
    except Exception as e:
        print(f"❌ Error retrieving chat history: {e}")
        return jsonify({
            "success": False,
            "error": str(e),
            "messages": []
        }), 500

if __name__ == "__main__":
    app.run(debug=True, port=5000)
