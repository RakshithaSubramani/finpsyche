import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
import joblib
import os

class PersonalityModel:
    def __init__(self):
        self.model = None
        self.personalities = ['Risk-Taker', 'Risk-Averse', 'Neutral', 'Impulsive', 'Emotional']
        # Get base directory (backend folder) - go up one level from models directory
        self.base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.load_or_train()

    def load_or_train(self):
        # Use models directory directly (same directory as this file)
        models_dir = os.path.dirname(os.path.abspath(__file__))
        model_path = os.path.join(models_dir, 'personality_model.pkl')
        
        if os.path.exists(model_path):
            try:
                self.model = joblib.load(model_path)
                print("✅ Personality model loaded!")
            except Exception as e:
                print(f"⚠️  Error loading model: {e}, training new...")
                self.train_model()
        else:
            self.train_model()

    def train_model(self):
        """
        Train the personality classification model using synthetic data.
        Generates training examples based on keyword patterns and emotion scores.
        """
        data = []
        
        texts_map = {
            'Risk-Taker': [
                "Let's go all in on crypto!",
                "High risk, high reward!",
                "I'm investing everything in stocks",
                "YOLO on this trade"
            ],
            'Risk-Averse': [
                "Too risky, stick to savings.",
                "I hate volatility.",
                "Only safe investments for me",
                "FDs are safest"
            ],
            'Neutral': [
                "Balanced portfolio sounds good.",
                "Moderate growth is fine.",
                "Diversified approach works",
                "Steady returns preferred"
            ],
            'Impulsive': [
                "Buy now before it's too late!",
                "Impulse buy that stock!",
                "I need to invest right now",
                "Quick decision needed"
            ],
            'Emotional': [
                "Money makes me anxious.",
                "Fear of missing out...",
                "I'm so worried about losses",
                "Financial stress is killing me"
            ]
        }
        
        for personality, text_list in texts_map.items():
            for text in text_list:
                emotion_score = 0.5
                risk_kw = 1 if any(kw in text.lower() for kw in ['risky', 'gamble', 'crypto', 'yolo', 'all in']) else 0
                safe_kw = 1 if any(kw in text.lower() for kw in ['safe', 'cautious', 'fd', 'savings', 'scared']) else 0
                impulsive_kw = 1 if any(kw in text.lower() for kw in ['now', 'immediately', 'quick', 'fomo', 'impulse']) else 0
                emotional_kw = 1 if any(kw in text.lower() for kw in ['anxious', 'worried', 'stress', 'panic', 'fear', 'emotion']) else 0
                
                features = [emotion_score, risk_kw, safe_kw, impulsive_kw, emotional_kw]
                data.append(features + [personality])

        df = pd.DataFrame(data, columns=['emotion_score', 'risk_kw', 'safe_kw', 'impulsive_kw', 'emotional_kw', 'personality'])
        X = df.drop('personality', axis=1).values  # Convert to numpy array to avoid feature name warnings
        y = df['personality'].values

        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        self.model = RandomForestClassifier(n_estimators=100, random_state=42, max_depth=10)
        self.model.fit(X_train, y_train)
        
        # Save in the models directory (same directory as this file)
        models_dir = os.path.dirname(os.path.abspath(__file__))
        model_path = os.path.join(models_dir, 'personality_model.pkl')
        os.makedirs(models_dir, exist_ok=True)
        joblib.dump(self.model, model_path)
        print("✅ Personality model trained and saved!")

    def predict(self, text, emotion):
        """
        Predict personality type from text and emotion.
        
        Args:
            text: User's message text
            emotion: Dictionary with 'score' key containing emotion score
            
        Returns:
            dict: Personality type and confidence score
        """
        emotion_score = emotion.get('score', 0.5)
        
        # Extract keyword features
        risk_keywords = ['risky', 'gamble', 'crypto', 'yolo', 'all in', 'high risk']
        safe_keywords = ['safe', 'cautious', 'fd', 'savings', 'scared', 'low risk']
        impulsive_keywords = ['now', 'immediately', 'quick', 'fomo', 'impulse', 'buy now']
        emotional_keywords = ['anxious', 'worried', 'stress', 'panic', 'fear', 'emotion', 'nervous']
        
        text_lower = text.lower()
        risk_kw = 1 if any(kw in text_lower for kw in risk_keywords) else 0
        safe_kw = 1 if any(kw in text_lower for kw in safe_keywords) else 0
        impulsive_kw = 1 if any(kw in text_lower for kw in impulsive_keywords) else 0
        emotional_kw = 1 if any(kw in text_lower for kw in emotional_keywords) else 0
        
        features = np.array([emotion_score, risk_kw, safe_kw, impulsive_kw, emotional_kw]).reshape(1, -1)
        
        if self.model:
            try:
                pred = self.model.predict(features)[0]
                conf = self.model.predict_proba(features).max()
                return {'type': pred, 'confidence': float(conf)}
            except Exception as e:
                print(f"⚠️  Prediction error: {e}")
        
        # Fallback logic based on keyword patterns
        if emotional_kw:
            return {'type': 'Emotional', 'confidence': 0.7}
        elif impulsive_kw:
            return {'type': 'Impulsive', 'confidence': 0.7}
        elif risk_kw and not safe_kw:
            return {'type': 'Risk-Taker', 'confidence': 0.7}
        elif safe_kw and not risk_kw:
            return {'type': 'Risk-Averse', 'confidence': 0.7}
        else:
            return {'type': 'Neutral', 'confidence': 0.5}