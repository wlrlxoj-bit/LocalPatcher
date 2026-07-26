import os
import requests
import uuid
import json
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('.env.local')

# Supabase setup
SUPABASE_URL = os.environ['NEXT_PUBLIC_SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
db = create_client(SUPABASE_URL, SUPABASE_KEY)

# Azure setup
AZURE_KEY = os.environ.get('AZURE_TRANSLATOR_KEY')
AZURE_REGION = os.environ.get('AZURE_TRANSLATOR_REGION')
AZURE_ENDPOINT = os.environ.get('AZURE_TRANSLATOR_ENDPOINT', 'https://api.cognitive.microsofttranslator.com')

def translate_terms(texts: list, target_lang: str) -> list:
    """Translate a batch of texts using Azure Translator."""
    if not AZURE_KEY:
        print("AZURE_TRANSLATOR_KEY is not set.")
        return []
    
    path = '/translate'
    constructed_url = AZURE_ENDPOINT + path
    params = {
        'api-version': '3.0',
        'from': 'en',
        'to': [target_lang]
    }
    headers = {
        'Ocp-Apim-Subscription-Key': AZURE_KEY,
        'Ocp-Apim-Subscription-Region': AZURE_REGION,
        'Content-type': 'application/json',
        'X-ClientTraceId': str(uuid.uuid4())
    }
    body = [{'text': t} for t in texts]
    
    request = requests.post(constructed_url, params=params, headers=headers, json=body)
    response = request.json()
    
    if type(response) is list and len(response) > 0 and 'translations' in response[0]:
        return [r['translations'][0]['text'] for r in response]
    else:
        print(f"Error in translation: {response}")
        return []

def main():
    print("[*] Fetching all common dictionary terms...")
    res = db.table('common_dictionary').select('id, english_term, translated_de, translated_es').execute()
    records = res.data or []
    print(f"[+] Found {len(records)} terms.")
    
    # Check if we have DE to translate
    de_needs_translation = [r for r in records if not r.get('translated_de')]
    if de_needs_translation:
        print(f"[*] Translating {len(de_needs_translation)} terms to German (de)...")
        texts_to_translate = [r['english_term'] for r in de_needs_translation]
        
        # Azure allows max 100 array elements per request
        batch_size = 50
        for i in range(0, len(texts_to_translate), batch_size):
            batch = texts_to_translate[i:i+batch_size]
            batch_records = de_needs_translation[i:i+batch_size]
            
            translated_batch = translate_terms(batch, 'de')
            if len(translated_batch) == len(batch):
                for j, trans in enumerate(translated_batch):
                    rec = batch_records[j]
                    try:
                        db.table('common_dictionary').update({'translated_de': trans}).eq('id', rec['id']).execute()
                    except Exception as e:
                        print(f"Failed to update DE for {rec['english_term']}: {e}")
            else:
                print("Failed to translate DE batch.")

    # Check if we have ES to translate
    es_needs_translation = [r for r in records if not r.get('translated_es')]
    if es_needs_translation:
        print(f"[*] Translating {len(es_needs_translation)} terms to Spanish (es)...")
        texts_to_translate = [r['english_term'] for r in es_needs_translation]
        
        batch_size = 50
        for i in range(0, len(texts_to_translate), batch_size):
            batch = texts_to_translate[i:i+batch_size]
            batch_records = es_needs_translation[i:i+batch_size]
            
            translated_batch = translate_terms(batch, 'es')
            if len(translated_batch) == len(batch):
                for j, trans in enumerate(translated_batch):
                    rec = batch_records[j]
                    try:
                        db.table('common_dictionary').update({'translated_es': trans}).eq('id', rec['id']).execute()
                    except Exception as e:
                        print(f"Failed to update ES for {rec['english_term']}: {e}")
            else:
                print("Failed to translate ES batch.")

    print("[*] Translation and dictionary update complete.")

if __name__ == "__main__":
    main()
