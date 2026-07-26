import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('.env.local')
client = create_client(os.environ['NEXT_PUBLIC_SUPABASE_URL'], os.environ['NEXT_PUBLIC_SUPABASE_ANON_KEY'])

# To check if columns exist, we can just select them and see if it throws an error
try:
    client.table('common_dictionary').select('translated_de, translated_es').limit(1).execute()
    print("Columns already exist!")
except Exception as e:
    print(f"Error (Columns probably missing): {e}")
