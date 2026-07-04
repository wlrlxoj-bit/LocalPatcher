import re
import sys

def extract_block(content, key):
    # Find key: { and match balanced braces
    start_idx = content.find(f"{key}:")
    if start_idx == -1:
        return ""
    brace_start = content.find("{", start_idx)
    if brace_start == -1:
        return ""
    
    # Balance braces
    count = 0
    end_idx = -1
    for i in range(brace_start, len(content)):
        char = content[i]
        if char == '{':
            count += 1
        elif char == '}':
            count -= 1
            if count == 0:
                end_idx = i
                break
    
    if end_idx == -1:
        return ""
    
    return content[brace_start+1:end_idx]

def main():
    path = r"C:\Users\wlrlx\OneDrive\Documents\.My Project\trainer-translation-site\lib\i18n.ts"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    ko_block = extract_block(content, "ko")
    en_block = extract_block(content, "en")
    ja_block = extract_block(content, "ja")

    if not ko_block or not en_block or not ja_block:
        print("Error: Could not extract ko, en, or ja dictionaries.")
        sys.exit(1)

    def extract_keys(text):
        keys = []
        for line in text.splitlines():
            line = line.strip()
            if not line or line.startswith("//"):
                continue
            # match pattern: keyName: or 'keyName': or "keyName":
            match = re.match(r'^([a-zA-Z0-9_]+)\s*:', line)
            if match:
                keys.append(match.group(1))
        return set(keys)

    ko_keys = extract_keys(ko_block)
    en_keys = extract_keys(en_block)
    ja_keys = extract_keys(ja_block)

    print(f"[*] Found {len(ko_keys)} keys for ko.")
    print(f"[*] Found {len(en_keys)} keys for en.")
    print(f"[*] Found {len(ja_keys)} keys for ja.")

    all_match = True
    if ko_keys != en_keys:
        all_match = False
        print("[-] Mismatch between ko and en keys:")
        print(f"    Only in ko: {ko_keys - en_keys}")
        print(f"    Only in en: {en_keys - ko_keys}")

    if ko_keys != ja_keys:
        all_match = False
        print("[-] Mismatch between ko and ja keys:")
        print(f"    Only in ko: {ko_keys - ja_keys}")
        print(f"    Only in ja: {ja_keys - ko_keys}")

    if all_match:
        print("[+] SUCCESS: All i18n dictionaries are complete and keys match perfectly!")
        sys.exit(0)
    else:
        sys.exit(1)

if __name__ == "__main__":
    main()
