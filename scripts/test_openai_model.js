const fs = require('fs');
const path = require('path');
const https = require('https');

// Manually parse .env.local
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[match[1]] = value;
  }
});

const openAiKey = env.OPENAI_API_KEY;
const geminiKey = env.GEMINI_API_KEY;

function askOpenAI(model, prompt) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: model,
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature: 0.1
    });

    const options = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAiKey}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(parsed.error.message));
          } else {
            resolve(parsed.choices[0].message.content.trim());
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

function askGemini(prompt) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(parsed.error.message));
          } else {
            resolve(parsed.candidates[0].content.parts[0].text);
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

async function run() {
  console.log('Testing model availability...');
  
  if (geminiKey) {
    try {
      console.log('Testing Gemini API (gemini-2.5-flash)...');
      const res = await askGemini('{"prompt": "Say hello in JSON", "translations": ["hello"]}');
      console.log('Gemini Success:', res);
    } catch (e) {
      console.error('Gemini Failed:', e.message);
    }
  } else {
    console.log('No GEMINI_API_KEY in env.');
  }

  const modelsToTest = ['gpt-4.1-mini', 'gpt-4.1-nano'];
  for (const model of modelsToTest) {
    if (openAiKey) {
      try {
        console.log(`Testing OpenAI API with model: ${model}...`);
        const res = await askOpenAI(model, 'Say hello');
        console.log(`OpenAI ${model} Success:`, res);
      } catch (e) {
        console.error(`OpenAI ${model} Failed:`, e.message);
      }
    }
  }
}

run();
