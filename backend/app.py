from flask import Flask, request, jsonify
from flask_cors import CORS
from models.emotion_model import EmotionModel
from models.personality_model import PersonalityModel
from db import save_to_db
from rag.rag_engine import setup_rag, retrieve_advice
import vertexai
from vertexai.generative_models import GenerativeModel
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

# Initialize Vertex AI Gemini with service account credentials
PROJECT_ID = os.getenv('GOOGLE_CLOUD_PROJECT_ID')
LOCATION = os.getenv('GOOGLE_CLOUD_LOCATION', 'us-central1')

gemini_model = None
if PROJECT_ID:
    try:
        # Try to use service account key file
        service_account_path = os.path.join(os.path.dirname(__file__), 'serviceAccountKey.json')
        if os.path.exists(service_account_path):
            # Set environment variable for Vertex AI to use service account
            os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = service_account_path
            vertexai.init(project=PROJECT_ID, location=LOCATION)
            gemini_model = GenerativeModel("gemini-pro")
            print("✅ Gemini initialized with service account!")
        else:
            # Fallback to default credentials
            vertexai.init(project=PROJECT_ID, location=LOCATION)
            gemini_model = GenerativeModel("gemini-pro")
            print("✅ Gemini initialized!")
    except Exception as e:
        print(f"⚠️  Gemini init error: {e}")
        gemini_model = None
else:
    print("⚠️  No PROJECT_ID - using fallback responses")

# Initialize models (local)
emotion_model = EmotionModel()
personality_model = PersonalityModel()
vectorstore = setup_rag()  # Local FAISS

# Fallback advice
FALLBACK_ADVICE = {
    'Risk-Averse': 'Consider low-risk investments like Fixed Deposits (FDs) or SIPs in debt funds for steady returns.',
    'Risk-Taker': 'Diversify your portfolio and never invest more than 10% in a single high-risk asset.',
    'Impulsive': 'Use the 24-hour rule before purchases above Rs 5000. Create a monthly budget.',
    'Emotional': 'Focus on long-term goals rather than daily market movements. Build an emergency fund first.',
    'Neutral': 'Maintain a balanced portfolio: 50% equity, 30% debt, 10% gold, 10% cash.'
}

@app.route('/chat', methods=['POST'])
def chat():
    """
    Main chat endpoint for financial advice.
    
    Accepts user message, analyzes emotion and personality, retrieves relevant
    context from RAG, generates response using Gemini (or fallback), and saves to Firestore.
    
    Request JSON:
        - message: User's message (required)
        - user_id: User identifier (optional, default: 1)
        
    Returns JSON:
        - reply: AI-generated financial advice
        - personality: Detected personality type
        - emotion: Detected emotion
    """
    try:
        data = request.json
        message = data.get('message', '')
        user_id = data.get('user_id', 1)

        if not message:
            return jsonify({'error': 'Message required'}), 400

        # Predict emotion and personality
        emotion = emotion_model.predict(message)
        personality = personality_model.predict(message, emotion)

        # Save to Firestore
        save_to_db(user_id, message, emotion, personality)

        # Get RAG context (local FAISS)
        context = []
        if vectorstore:
            context = retrieve_advice(vectorstore, message, personality['type'], emotion['emotion'])

        # Generate response with Gemini
        if gemini_model:
            try:
                prompt = f"""You are a financial advisor. Format your response as:
I understand: '[user message]'

personality_type: [personality]
emotion: [emotion]
financial_advice: [your advice in 2-3 sentences]

User: {message}
Personality: {personality['type']}
Emotion: {emotion['emotion']}
Context: {' '.join(context[:2]) if context else 'General financial advice'}

Give personalized advice:"""
                
                response = gemini_model.generate_content(prompt)
                reply = response.text.strip()
            except Exception as e:
                error_msg = str(e)
                # Check if it's a billing error (common and expected - fallback works fine)
                if 'BILLING_DISABLED' not in error_msg and 'billing' not in error_msg.lower():
                    # Only log non-billing errors
                    print(f"❌ Gemini error: {error_msg[:200]}")
                # Silently use fallback for billing errors (expected behavior)
                reply = generate_fallback(message, personality['type'], emotion['emotion'], context)
        else:
            reply = generate_fallback(message, personality['type'], emotion['emotion'], context)

        return jsonify({
            'reply': reply,
            'personality': personality['type'],
            'emotion': emotion['emotion']
        })
    except Exception as e:
        print(f"❌ Error: {e}")
        return jsonify({'error': str(e)}), 500

def generate_fallback(message, personality, emotion, context):
    """
    Generate fallback financial advice when Gemini is unavailable.
    Provides well-formatted, personalized advice based on personality and emotion.
    
    Args:
        message: User's message
        personality: User's personality type
        emotion: User's detected emotion
        context: RAG context from knowledge base
        
    Returns:
        str: Well-formatted personalized financial advice with line breaks
    """
    # Enhanced fallback advice based on personality and emotion
    base_advice = FALLBACK_ADVICE.get(personality, FALLBACK_ADVICE['Neutral'])
    
    # Add emotion-specific guidance with better formatting
    emotion_guidance = {
        'Stress': 'Track expenses daily using apps. Set up automatic savings that deduct before you can spend. Build emergency fund first.',
        'Fear': 'Remember that fear is normal, but don\'t let it paralyze your decisions. Start with small, safe steps like building an emergency fund.',
        'Hesitation': 'It\'s okay to be cautious. Research thoroughly before making decisions. Start with low-risk investments.',
        'Overconfidence': 'Stay grounded and remember that markets are unpredictable. Diversify your investments and never invest more than you can afford to lose.',
        'Excitement': 'Channel this energy into careful planning rather than impulsive actions. Create a budget and stick to it.',
        'Confidence': 'Your confidence is good, but always maintain a balanced approach. Diversify your portfolio.',
        'Calm': 'Your calm approach is valuable for long-term financial planning. Continue with steady, consistent investments.'
    }
    
    # Use RAG context if available, otherwise use emotion-specific guidance
    if context and len(context) > 0:
        advice = context[0].strip()
        # RAG context from CSV might contain the full row, extract just the advice
        # CSV format: "personality_type,emotion,financial_advice"
        if ',' in advice:
            # Split by comma and get the last part (financial_advice column)
            parts = advice.split(',')
            if len(parts) >= 3:
                # Get the financial_advice part (last column)
                advice = parts[-1].strip().strip('"')
            elif len(parts) == 1:
                # Already just the advice
                advice = parts[0].strip().strip('"')
        # Remove any existing formatting markers
        advice = advice.replace('personality_type:', '').replace('emotion:', '').replace('financial_advice:', '').strip()
    else:
        advice = emotion_guidance.get(emotion, base_advice)
    
    # Well-formatted response with each item on a separate line
    return f"I understand: '{message}'.\n\npersonality_type: {personality}\nemotion: {emotion}\nfinancial_advice: {advice}"

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'gemini': gemini_model is not None,
        'rag': vectorstore is not None,
        'project_id': PROJECT_ID or 'not_set'
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)