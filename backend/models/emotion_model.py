import pandas as pd
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
import joblib
import os

class EmotionModel:
    def __init__(self):
        self.analyzer = SentimentIntensityAnalyzer()
        self.model = None
        self.vectorizer = None
        self.emotions = ['Fear', 'Stress', 'Excitement', 'Confidence', 'Hesitation', 'Overconfidence', 'Calm']
        # Get base directory (backend folder) - go up one level from models directory
        self.base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.load_or_train()

    def load_or_train(self):
        # Use models directory directly (same directory as this file)
        models_dir = os.path.dirname(os.path.abspath(__file__))
        model_path = os.path.join(models_dir, 'emotion_model.pkl')
        vectorizer_path = os.path.join(models_dir, 'emotion_vectorizer.pkl')
        
        if os.path.exists(model_path) and os.path.exists(vectorizer_path):
            try:
                self.model = joblib.load(model_path)
                self.vectorizer = joblib.load(vectorizer_path)
                print("✅ Emotion model loaded!")
            except Exception as e:
                print(f"⚠️  Error loading model: {e}, training new...")
                self.train_model()
        else:
            self.train_model()

    def train_model(self):
        csv_path = os.path.join(self.base_dir, 'data', 'emotion_data.csv')
        if not os.path.exists(csv_path):
            print(f"⚠️  {csv_path} not found! Using fallback emotion detection.")
            return
        
        df = pd.read_csv(csv_path)
        X = df['text']
        y = df['label']

        self.vectorizer = TfidfVectorizer(max_features=1000, ngram_range=(1, 2))
        X_vec = self.vectorizer.fit_transform(X)

        X_train, X_test, y_train, y_test = train_test_split(X_vec, y, test_size=0.2, random_state=42)
        self.model = LogisticRegression(multi_class='multinomial', max_iter=500, random_state=42)
        self.model.fit(X_train, y_train)

        # Save the trained model and vectorizer in the models directory (same as this file)
        models_dir = os.path.dirname(os.path.abspath(__file__))
        model_path = os.path.join(models_dir, 'emotion_model.pkl')
        vectorizer_path = os.path.join(models_dir, 'emotion_vectorizer.pkl')
        os.makedirs(models_dir, exist_ok=True)
        joblib.dump(self.model, model_path)
        joblib.dump(self.vectorizer, vectorizer_path)
        print("✅ Emotion model trained and saved!")

    def predict(self, text):
        """
        Predict emotion from text using VADER sentiment and ML model.
        
        Args:
            text: User's message text
            
        Returns:
            dict: Detected emotion and confidence score
        """
        scores = self.analyzer.polarity_scores(text)
        text_lower = text.lower()
        
        # Enhanced fallback emotion detection using VADER sentiment and keywords
        # Check for specific emotion indicators first - ORDER MATTERS!
        
        # Stress/Regret indicators (check first - highest priority)
        stress_indicators = [
            'no control', 'can\'t control', 'cannot control', 'have no control',
            'regret', 'regretting', 'regretted', 'sorry', 'wish i hadn\'t', 
            'shouldn\'t have', 'spending too much', 'overspend', 'overspending',
            'stress', 'stressed', 'overwhelming', 'overwhelmed', 'anxious',
            'worried about', 'concerned about', 'struggling with'
        ]
        
        # Fear indicators
        fear_keywords = ['crash', 'lose', 'losing', 'terrified', 'scared', 'afraid', 'worried', 'panic']
        
        # Hesitation indicators
        hesitation_keywords = ['hesitant', 'unsure', 'not sure', 'maybe', 'doubt', 'uncertain']
        
        # Overconfidence indicators (only if clearly positive)
        overconfidence_keywords = ['sure i\'ll', 'bet the farm', 'make a fortune', 'rich quick', 'guaranteed', 'can\'t lose', 'definitely will']
        
        # Excitement indicators (only if clearly positive)
        excitement_keywords = ['boom', 'exciting', 'amazing', 'pumped', 'thrilled', 'awesome']
        
        # Priority-based emotion detection - check stress/regret FIRST
        has_stress_indicator = any(indicator in text_lower for indicator in stress_indicators)
        has_fear = any(kw in text_lower for kw in fear_keywords)
        has_hesitation = any(kw in text_lower for kw in hesitation_keywords)
        has_overconfidence = any(kw in text_lower for kw in overconfidence_keywords)
        has_excitement = any(kw in text_lower for kw in excitement_keywords)
        
        if has_stress_indicator:
            # Stress/regret takes highest priority
            emotion = 'Stress'
        elif has_fear:
            emotion = 'Fear'
        elif has_hesitation:
            emotion = 'Hesitation'
        elif has_overconfidence and scores['compound'] > 0.3:
            # Only overconfidence if sentiment is positive
            emotion = 'Overconfidence'
        elif has_excitement and scores['compound'] > 0.3:
            # Only excitement if sentiment is positive
            emotion = 'Excitement'
        elif scores['compound'] < -0.3:
            # Negative sentiment defaults to stress
            emotion = 'Stress'
        elif scores['compound'] > 0.3:
            # Positive sentiment without specific keywords
            emotion = 'Confidence'
        else:
            emotion = 'Calm'

        # Use ML model if available, but validate against keyword-based detection
        if self.model and self.vectorizer:
            try:
                X_vec = self.vectorizer.transform([text])
                pred = self.model.predict(X_vec)[0]
                score = self.model.predict_proba(X_vec).max()
                
                # Validate ML prediction against keyword-based detection
                # Override ML if it clearly contradicts keyword-based detection
                has_stress_indicator = any(indicator in text_lower for indicator in [
                    'no control', 'can\'t control', 'cannot control', 'have no control',
                    'regret', 'regretting', 'spending too much', 'overspend', 'stress', 'stressed'
                ])
                
                if has_stress_indicator and pred in ['Overconfidence', 'Excitement', 'Calm']:
                    # ML incorrectly predicted positive/neutral emotion when keywords suggest Stress
                    return {'emotion': 'Stress', 'score': float(score) * 0.8}
                elif pred in ['Overconfidence', 'Excitement'] and scores['compound'] < -0.3:
                    # ML predicted positive emotion but sentiment is negative
                    return {'emotion': emotion, 'score': float(score) * 0.7}
                elif pred == 'Calm' and has_stress_indicator:
                    # ML predicted Calm when there are clear stress indicators
                    return {'emotion': 'Stress', 'score': float(score) * 0.8}
                
                return {'emotion': pred, 'score': float(score)}
            except Exception as e:
                print(f"⚠️  ML prediction error: {e}, using fallback")
        
        return {'emotion': emotion, 'score': abs(scores['compound'])}