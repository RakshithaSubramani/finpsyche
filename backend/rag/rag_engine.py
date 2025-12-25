import os
from dotenv import load_dotenv
from langchain_community.document_loaders import CSVLoader
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain.text_splitter import CharacterTextSplitter

load_dotenv()

def setup_rag():
    """
    Setup RAG (Retrieval-Augmented Generation) with local FAISS vector store.
    
    Loads knowledge base from CSV, creates embeddings, and builds/loads FAISS index.
    
    Returns:
        FAISS vectorstore or None if setup fails
    """
    # Get base directory (backend folder)
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    vectorstore_path = os.path.join(base_dir, 'rag', 'faiss_index')
    csv_path = os.path.join(base_dir, 'data', 'knowledge_base.csv')
    
    if not os.path.exists(csv_path):
        print("⚠️  Warning: knowledge_base.csv not found!")
        return None
    
    try:
        # Load knowledge base
        loader = CSVLoader(file_path=csv_path)
        docs = loader.load()
        
        if not docs or len(docs) == 0:
            print("⚠️  Warning: Knowledge base is empty!")
            return None
        
        # Split documents
        text_splitter = CharacterTextSplitter(chunk_size=500, chunk_overlap=50)
        splits = text_splitter.split_documents(docs)
        
        # Create embeddings
        embeddings = HuggingFaceEmbeddings(
            model_name="sentence-transformers/all-MiniLM-L6-v2"
        )
        
        # Load or create vectorstore
        if os.path.exists(vectorstore_path) and os.path.exists(f"{vectorstore_path}/index.faiss"):
            try:
                vectorstore = FAISS.load_local(vectorstore_path, embeddings, allow_dangerous_deserialization=True)
                print("✅ RAG index loaded!")
            except Exception as e:
                print(f"⚠️  Error loading index, recreating: {e}")
                vectorstore = FAISS.from_documents(splits, embeddings)
                vectorstore.save_local(vectorstore_path)
                print("✅ RAG index created!")
        else:
            vectorstore = FAISS.from_documents(splits, embeddings)
            vectorstore.save_local(vectorstore_path)
            print("✅ RAG index created!")
        
        return vectorstore
    except Exception as e:
        print(f"❌ Error setting up RAG: {e}")
        return None

def retrieve_advice(vectorstore, query, personality, emotion, k=3):
    """
    Retrieve relevant financial advice from knowledge base using semantic search.
    
    Args:
        vectorstore: FAISS vectorstore containing knowledge base embeddings
        query: User's message/query
        personality: User's detected personality type
        emotion: User's detected emotion
        k: Number of relevant documents to retrieve (default: 3)
        
    Returns:
        list: List of relevant advice strings from knowledge base
    """
    if vectorstore is None:
        return []
    
    try:
        # Combine query with personality and emotion for better context
        full_query = f"{query} personality:{personality} emotion:{emotion}"
        relevant_docs = vectorstore.similarity_search(full_query, k=k)
        return [doc.page_content for doc in relevant_docs]
    except Exception as e:
        print(f"❌ Error retrieving advice: {e}")
        return []