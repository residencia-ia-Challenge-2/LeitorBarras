# Nutrici-IA - Leitor de Código de Barras 🥗📱

Aplicativo mobile e backend inteligente para leitura de códigos de barras (EAN-13) em produtos de supermercado, inspeção de dados nutricionais via Open Food Facts e análise personalizada com IA local (Ollama).

---

## 🛠️ Tecnologias Utilizadas

- **Backend**: Python 3, FastAPI, Uvicorn, Pydantic, Requests, Ollama Python SDK.
- **Mobile**: React Native, Expo SDK 58, Expo Camera (`CameraView`).
- **IA Local**: Ollama (Gemma 2 / Llama 3) com prompt determinístico (`temperature=0.2`) e saída JSON estrita.
- **Base de Dados Nutricional**: Open Food Facts API v2.

---

## 📂 Estrutura do Projeto

```text
LeitorBarra/
├── backend/
│   ├── main.py              # Aplicação FastAPI, rotas e integração com Open Food Facts e Ollama
│   ├── requirements.txt     # Dependências Python
│   ├── test_backend.py      # Testes unitários do payload e contratos Pydantic
│   └── test_endpoints.py    # Testes unitários das rotas HTTP
├── mobile/
│   ├── App.js               # Componente raiz do React Native
│   ├── index.js             # Entrada do Expo
│   ├── app.json             # Metadados e permissões da câmera no Expo
│   ├── package.json         # Dependências do app
│   └── components/
│       └── NutriScanner.jsx # Componente de escaneamento, mira visual e visualização de resultados
├── .gitignore
└── README.md
```

---

## 🚀 Como Executar

### 1. Iniciar o Ollama (LLM Local)
Certifique-se de que o Ollama está instalado e com o modelo baixado:
```bash
ollama run gemma2:9b
# ou: ollama run llama3:8b
```

### 2. Iniciar o Servidor FastAPI
```bash
cd backend
python3 -m venv ../venv
source ../venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```
A documentação interativa estará acessível em: `http://localhost:8000/docs`

### 3. Iniciar o Aplicativo Mobile (Expo)
```bash
cd mobile
npm install
npx expo start
```
Escaneie o QR Code no app **Expo Go** (iOS ou Android).

No topo do app, toque no botão `⚙️ IP` para configurar o endereço IP local do seu computador na rede ou link de túnel.
