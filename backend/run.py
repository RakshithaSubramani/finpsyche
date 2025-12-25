from app import app

if __name__ == '__main__':
    print("🚀 Starting FinPsyche backend...")
    print("📡 Backend running on http://localhost:5000")
    app.run(debug=True, port=5000)