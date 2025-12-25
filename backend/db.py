from google.cloud import firestore
from google.oauth2 import service_account
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

# Initialize Firestore with service account credentials
try:
    # Try to use service account key file
    service_account_path = os.path.join(os.path.dirname(__file__), 'serviceAccountKey.json')
    if os.path.exists(service_account_path):
        credentials = service_account.Credentials.from_service_account_file(service_account_path)
        db = firestore.Client(credentials=credentials, project=credentials.project_id)
        print("✅ Firestore initialized with service account key")
    else:
        # Fallback to default credentials
        db = firestore.Client()
        print("✅ Firestore initialized with default credentials")
except Exception as e:
    print(f"⚠️  Firestore initialization error: {e}")
    db = None

def save_to_db(user_id, message_text, emotion, personality):
    """
    Save user message with emotion and personality analysis to Firestore.
    
    Args:
        user_id: Unique identifier for the user
        message_text: The user's message text
        emotion: Dictionary with 'emotion' and 'score' keys
        personality: Dictionary with 'type' and 'confidence' keys
        
    Returns:
        bool: True if saved successfully, False otherwise
    """
    if db is None:
        print("⚠️  Firestore not initialized, skipping save")
        return False
    
    try:
        # Save message with all data in one document
        message_ref = db.collection('messages').document()
        message_ref.set({
            'user_id': str(user_id),
            'text': message_text,
            'emotion': emotion['emotion'],
            'emotion_score': float(emotion.get('score', 0.0)),
            'personality': personality['type'],
            'personality_confidence': float(personality.get('confidence', 0.5)),
            'timestamp': datetime.utcnow()
        })
        print(f"✅ Saved to Firestore: {message_ref.id}")
        return True
    except Exception as e:
        print(f"❌ Firestore error: {e}")
        return False