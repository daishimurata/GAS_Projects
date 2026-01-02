
import google.generativeai as genai
import os

API_KEY = "AIzaSyA71N8Tr5x4w6S6gMo5EiQGfd2cHHfumxE"
genai.configure(api_key=API_KEY)

print("Listing models...")
try:
    models = genai.list_models()
    for m in models:
        if 'generateContent' in m.supported_generation_methods:
            print(f"Model: {m.name}")
except Exception as e:
    print(f"Error listing models: {e}")

print("\nTesting gemini-1.5-flash...")
try:
    model = genai.GenerativeModel('gemini-1.5-flash')
    response = model.generate_content("Hello")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error with gemini-1.5-flash: {e}")

print("\nTesting models/gemini-1.5-flash...")
try:
    model = genai.GenerativeModel('models/gemini-1.5-flash')
    response = model.generate_content("Hello")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error with models/gemini-1.5-flash: {e}")
