"""
Script to retrain emotion/personality models and rebuild RAG index.
Run this script to apply all the new advanced financial topics.

Usage:
    python retrain_models.py
"""

import os
import shutil

def retrain_models():
    """Delete model files to trigger retraining on next app run."""
    models_dir = os.path.join(os.path.dirname(__file__), 'models')
    
    model_files = [
        'emotion_model.pkl',
        'emotion_vectorizer.pkl',
        'personality_model.pkl'
    ]
    
    print("🔄 Retraining Models...")
    print("=" * 50)
    
    deleted_count = 0
    for model_file in model_files:
        model_path = os.path.join(models_dir, model_file)
        if os.path.exists(model_path):
            try:
                os.remove(model_path)
                print(f"✅ Deleted: {model_file}")
                deleted_count += 1
            except Exception as e:
                print(f"❌ Error deleting {model_file}: {e}")
        else:
            print(f"ℹ️  {model_file} not found (will be created on next run)")
    
    if deleted_count > 0:
        print(f"\n✅ {deleted_count} model file(s) deleted successfully!")
        print("📝 Models will be retrained automatically on next app run.")
    else:
        print("\nℹ️  No model files found. They will be created on next app run.")
    
    return deleted_count

def rebuild_rag_index():
    """Delete RAG index to trigger rebuild on next app run."""
    rag_dir = os.path.join(os.path.dirname(__file__), 'rag', 'faiss_index')
    
    index_files = [
        'index.faiss',
        'index.pkl'
    ]
    
    print("\n🔄 Rebuilding RAG Index...")
    print("=" * 50)
    
    deleted_count = 0
    for index_file in index_files:
        index_path = os.path.join(rag_dir, index_file)
        if os.path.exists(index_path):
            try:
                os.remove(index_path)
                print(f"✅ Deleted: {index_file}")
                deleted_count += 1
            except Exception as e:
                print(f"❌ Error deleting {index_file}: {e}")
        else:
            print(f"ℹ️  {index_file} not found (will be created on next run)")
    
    if deleted_count > 0:
        print(f"\n✅ {deleted_count} RAG index file(s) deleted successfully!")
        print("📝 RAG index will be rebuilt automatically on next app run.")
    else:
        print("\nℹ️  No RAG index files found. They will be created on next app run.")
    
    return deleted_count

def main():
    """Main function to retrain everything."""
    print("🚀 FinPsyche Model Retraining Script")
    print("=" * 50)
    print("This script will:")
    print("1. Delete existing model files (.pkl)")
    print("2. Delete existing RAG index files")
    print("3. Models will auto-retrain on next app run")
    print("=" * 50)
    print()
    
    # Retrain models
    models_deleted = retrain_models()
    
    # Rebuild RAG index
    rag_deleted = rebuild_rag_index()
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 Summary")
    print("=" * 50)
    print(f"✅ Model files deleted: {models_deleted}")
    print(f"✅ RAG index files deleted: {rag_deleted}")
    print()
    print("🎯 Next Steps:")
    print("1. Run your Flask app: python run.py")
    print("2. Models will automatically retrain with new data")
    print("3. RAG index will automatically rebuild with new knowledge base")
    print("4. This may take a few minutes on first run")
    print()
    print("✨ All done! Your models are ready to be retrained.")

if __name__ == "__main__":
    main()

