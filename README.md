# Risk Personality Scanner

AI-powered chatbot analyzing financial chats for risk personality using NLP/ML/RAG. Integrated with **Google Firebase** for secure auth and real-time DB.

## Tech Stack
- Backend: Flask, scikit-learn, LangChain, Hugging Face, **Firebase Admin SDK**
- Frontend: React + Chakra UI, **Firebase SDK**
- DB: **Google Firestore** (real-time)
- Free APIs: Pinecone, Hugging Face
- **Google Integration:** Firebase for Auth (Google Sign-In) + Firestore for chat history.

## Setup
1. Backend: `cd backend && pip install -r requirements.txt && python run.py`
2. Frontend: `cd frontend && npm install && npm start`
3. Firebase: Download `serviceAccountKey.json` to backend/ and paste `firebaseConfig` to src/firebase.js.

## Demo
Sign in with Google → Chat: "I'm worried about market crash" → Detects Fear + Risk-Averse → Saves to Firestore.

## Competition Notes
- ML: Emotion (VADER + Logistic) + Personality (Random Forest)
- RAG: HF embeddings + Pinecone
- Firebase: Enables personalized, real-time sessions—scalable for 1000s users.

