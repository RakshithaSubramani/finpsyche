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

def save_to_db(user_id, message_text, emotion=None, personality=None, sender='user'):
    """
    Save message (user or bot) to Firestore.
    
    Args:
        user_id: Unique identifier for the user
        message_text: The message text
        emotion: Dictionary with 'emotion' and 'score' keys (optional for bot messages)
        personality: Dictionary with 'type' and 'confidence' keys (optional for bot messages)
        sender: 'user' or 'bot' (default: 'user')
        
    Returns:
        bool: True if saved successfully, False otherwise
    """
    if db is None:
        print("⚠️  Firestore not initialized, skipping save")
        return False
    
    try:
        # Prepare message data
        message_data = {
            'user_id': str(user_id),
            'text': message_text,
            'sender': sender,
            'timestamp': datetime.utcnow()
        }
        
        # Add emotion and personality data if provided (usually only for user messages)
        if emotion:
            message_data['emotion'] = emotion.get('emotion', '') if isinstance(emotion, dict) else str(emotion)
            message_data['emotion_score'] = float(emotion.get('score', 0.0)) if isinstance(emotion, dict) else 0.0
        
        if personality:
            message_data['personality'] = personality.get('type', '') if isinstance(personality, dict) else str(personality)
            message_data['personality_confidence'] = float(personality.get('confidence', 0.5)) if isinstance(personality, dict) else 0.5
        
        # Save message with all data in one document
        message_ref = db.collection('messages').document()
        message_ref.set(message_data)
        print(f"✅ Saved {sender} message to Firestore: {message_ref.id}")
        return True
    except Exception as e:
        print(f"❌ Firestore error: {e}")
        return False

def get_chat_history(user_id, limit=50):
    """
    Retrieve chat history for a user from Firestore.
    
    Args:
        user_id: Unique identifier for the user
        limit: Maximum number of messages to retrieve (default: 50)
        
    Returns:
        list: List of message dictionaries sorted by timestamp (oldest first)
    """
    if db is None:
        print("⚠️  Firestore not initialized, cannot retrieve history")
        return []
    
    try:
        # Query messages for this user (no order_by to avoid index requirement)
        messages_ref = db.collection('messages')
        query = messages_ref.where('user_id', '==', str(user_id)).limit(limit * 2)  # Get more than limit to account for sorting
        
        docs = query.stream()
        messages = []
        
        for doc in docs:
            data = doc.to_dict()
            # Get timestamp for sorting and serialization
            timestamp = data.get('timestamp')
            timestamp_obj = None
            timestamp_str = None
            
            if timestamp:
                # Handle Firestore Timestamp object
                if hasattr(timestamp, 'timestamp'):
                    # Firestore Timestamp - convert to datetime for sorting
                    timestamp_obj = datetime.utcfromtimestamp(timestamp.timestamp())
                    timestamp_str = timestamp_obj.isoformat()
                elif hasattr(timestamp, 'isoformat'):
                    # Already a datetime object
                    timestamp_obj = timestamp
                    timestamp_str = timestamp.isoformat()
                else:
                    # Fallback
                    timestamp_obj = datetime.utcnow()
                    timestamp_str = timestamp_obj.isoformat()
            else:
                # No timestamp - use current time
                timestamp_obj = datetime.utcnow()
                timestamp_str = timestamp_obj.isoformat()
            
            messages.append({
                'id': doc.id,
                'text': data.get('text', ''),
                'sender': data.get('sender', 'user'),  # Include sender information
                'emotion': data.get('emotion', ''),
                'personality': data.get('personality', ''),
                'timestamp': timestamp_str,
                '_sort_key': timestamp_obj  # Temporary key for sorting (will be removed)
            })
        
        # Sort messages by timestamp (oldest first) in Python to avoid Firestore index requirement
        messages.sort(key=lambda x: x['_sort_key'] if x['_sort_key'] else datetime.min)
        
        # Remove temporary sorting key and limit results
        for msg in messages:
            del msg['_sort_key']
        
        messages = messages[:limit]
        
        print(f"✅ Retrieved {len(messages)} messages from Firestore for user {user_id}")
        return messages
    except Exception as e:
        print(f"❌ Firestore error retrieving history: {e}")
        return []