import json
import os
from typing import Any, Dict, List, Optional
import requests
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import ollama

app = FastAPI(
    title="Nutrici-IA API",
    description="API para inspeção nutricional e análise com LLM local para produtos de supermercado",
    version="1.0.0",
)

# ---------------------------------------------------------------------------
# CORS Middleware: Habilita acesso de qualquer origem (útil para rede local/mobile)
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OPEN_FOOD_FACTS_BASE_URL = "https://world.openfoodfacts.org/api/v2/product"
OPEN_FOOD_FACTS_HEADERS = {
    "User-Agent": "NutriciIA - Android/iOS App - Version 1.0 (nutrici-ia@local.dev)"
}
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma2:9b")
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434")

# ---------------------------------------------------------------------------
# Modelos Pydantic
# ---------------------------------------------------------------------------
class AnaliseNutricional(BaseModel):
    score_saude: int = Field(..., ge=0, le=100, description="Nota de saúde calculada de 0 a 100")
    resumo: str = Field(..., description="Resumo nutricional curto e conciso")
    pontos_positivos: List[str] = Field(..., description="Aspectos positivos do produto")
    pontos_atencao: List[str] = Field(..., description="Pontos de alerta ou atenção nutricional")
    explicacao_detalhada: str = Field(..., description="Explicação detalhada em linguagem acessível")


class InspecaoResponse(BaseModel):
    texto_preview: str
    payload_llm: Dict[str, Any]


# ---------------------------------------------------------------------------
# Função Utilitária de Filtro de Dados
# ---------------------------------------------------------------------------
def filtrar_payload_nutricional(produto_raw: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extrai apenas os dados essenciais do produto do Open Food Facts,
    otimizando a resposta e economizando tokens de contexto na LLM.
    """
    raw_nutriments = produto_raw.get("nutriments", {})

    nutriments_limpos = {
        "calorias_kcal_100g": raw_nutriments.get("energy-kcal_100g", raw_nutriments.get("energy-kcal")),
        "acucares_100g": raw_nutriments.get("sugars_100g", raw_nutriments.get("sugars")),
        "gordura_saturada_100g": raw_nutriments.get("saturated-fat_100g", raw_nutriments.get("saturated-fat")),
        "sodio_100g": raw_nutriments.get("sodium_100g", raw_nutriments.get("sodium")),
        "proteinas_100g": raw_nutriments.get("proteins_100g", raw_nutriments.get("proteins")),
    }

    return {
        "product_name": produto_raw.get("product_name") or produto_raw.get("product_name_pt") or "Nome não informado",
        "brands": produto_raw.get("brands") or "Marca não informada",
        "nutriscore_grade": str(produto_raw.get("nutriscore_grade") or "N/D").upper(),
        "nova_group": produto_raw.get("nova_group") or "N/D",
        "ingredients_text_pt": (
            produto_raw.get("ingredients_text_pt")
            or produto_raw.get("ingredients_text")
            or "Ingredientes não informados"
        ),
        "nutriments": nutriments_limpos,
    }


def gerar_texto_preview(payload_llm: Dict[str, Any]) -> str:
    """Gera representação textual simples e legível dos dados nutricionais."""
    nutri = payload_llm.get("nutriments", {})

    def format_valor(val, unidade="g"):
        if val is None:
            return "Não informado"
        return f"{val} {unidade}".strip()

    return (
        f"PRODUTO: {payload_llm.get('product_name')} ({payload_llm.get('brands')})\n"
        f"Nutri-Score: {payload_llm.get('nutriscore_grade')} | Grupo NOVA: {payload_llm.get('nova_group')}\n\n"
        f"INFORMAÇÃO NUTRICIONAL (por 100g):\n"
        f"• Calorias: {format_valor(nutri.get('calorias_kcal_100g'), 'kcal')}\n"
        f"• Açúcares: {format_valor(nutri.get('acucares_100g'))}\n"
        f"• Gordura Saturada: {format_valor(nutri.get('gordura_saturada_100g'))}\n"
        f"• Sódio: {format_valor(nutri.get('sodio_100g'))}\n"
        f"• Proteínas: {format_valor(nutri.get('proteinas_100g'))}\n\n"
        f"INGREDIENTES:\n{payload_llm.get('ingredients_text_pt')}"
    )


def buscar_produto_openfoodfacts(barcode: str) -> Dict[str, Any]:
    """Consulta o Open Food Facts via API REST oficial."""
    url = f"{OPEN_FOOD_FACTS_BASE_URL}/{barcode}.json"
    try:
        response = requests.get(url, headers=OPEN_FOOD_FACTS_HEADERS, timeout=8.0)
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro de conexão ao consultar Open Food Facts: {str(exc)}",
        )

    if response.status_code == 404:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Código de barras {barcode} não encontrado no Open Food Facts.",
        )

    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Falha na API externa do Open Food Facts (Status {response.status_code}).",
        )

    dados = response.json()
    if dados.get("status") != 1 or "product" not in dados:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Produto correspondente ao código {barcode} não cadastrado.",
        )

    return dados["product"]


# ---------------------------------------------------------------------------
# Endpoints da API
# ---------------------------------------------------------------------------
@app.get("/")
def raiz():
    return {
        "status": "online",
        "app": "Nutrici-IA API",
        "docs": "/docs"
    }


@app.get("/api/v1/inspecionar/{barcode}", response_model=InspecaoResponse)
def inspecionar_produto(barcode: str):
    """
    Endpoint de Inspeção Direta (Sem IA):
    Consulta o produto no Open Food Facts e retorna a string formatada
    e o payload JSON limpo/filtrado para exibição instantânea no app.
    """
    produto_raw = buscar_produto_openfoodfacts(barcode)
    payload_llm = filtrar_payload_nutricional(produto_raw)
    texto_preview = gerar_texto_preview(payload_llm)

    return InspecaoResponse(
        texto_preview=texto_preview,
        payload_llm=payload_llm,
    )


@app.post("/api/v1/analisar-com-ia/{barcode}", response_model=AnaliseNutricional)
def analisar_com_ia(barcode: str):
    """
    Endpoint de Análise Inteligente (Com IA Local via Ollama):
    Filtra os dados nutricionais do produto e envia ao Ollama local
    gerando nota de saúde (0 a 100) e parecer nutricional em JSON estrito.
    """
    produto_raw = buscar_produto_openfoodfacts(barcode)
    payload_llm = filtrar_payload_nutricional(produto_raw)

    system_prompt = (
        "Você é um nutricionista sênior especialista em rotulagem e saúde pública. "
        "Analise os dados nutricionais e de ingredientes fornecidos de um produto de supermercado. "
        "Você deve atribuir uma pontuação de saúde 'score_saude' de 0 a 100 (onde 0 é extremamente nocivo/ultraprocessado "
        "e 100 é um alimento in natura altamente nutritivo e saudável), "
        "destacar pontos positivos, pontos de atenção (como excesso de açúcares, sódio, gorduras saturadas, aditivos) "
        "e fornecer um resumo conciso e uma explicação detalhada clara para o consumidor.\n"
        "Retorne OBRIGATORIAMENTE APENAS o JSON que atenda à especificação Pydantic a seguir, "
        "sem blocos de código markdown ou texto antes/depois:\n"
        "{\n"
        '  "score_saude": <int entre 0 e 100>,\n'
        '  "resumo": "<string curta>",\n'
        '  "pontos_positivos": ["<string>", ...],\n'
        '  "pontos_atencao": ["<string>", ...],\n'
        '  "explicacao_detalhada": "<string explicativa>"\n'
        "}"
    )

    user_prompt = f"Dados do produto para análise:\n{json.dumps(payload_llm, ensure_ascii=False, indent=2)}"

    try:
        client = ollama.Client(host=OLLAMA_HOST)
        resposta_ollama = client.chat(
            model=OLLAMA_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            format="json",
            options={"temperature": 0.2},
        )
        conteudo = resposta_ollama["message"]["content"]
        dados_json = json.loads(conteudo)
        return AnaliseNutricional.model_validate(dados_json)

    except (ollama.ResponseError, requests.exceptions.ConnectionError, Exception) as exc:
        # Se o erro já for HTTPException, propaga; caso contrário, formata erro 500
        if isinstance(exc, HTTPException):
            raise exc
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Falha na comunicação ou processamento com o Ollama local: {str(exc)}",
        )
