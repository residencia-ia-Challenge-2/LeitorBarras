import unittest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

class TestNutriciIAEndpoints(unittest.TestCase):
    @patch("backend.main.requests.get")
    def test_inspecionar_sucesso(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "status": 1,
            "product": {
                "product_name": "Suco de Laranja Integral",
                "brands": "Citrus",
                "nutriscore_grade": "c",
                "nova_group": 1,
                "ingredients_text_pt": "Suco de laranja pasteurizado.",
                "nutriments": {
                    "energy-kcal_100g": 45,
                    "sugars_100g": 9.0,
                    "saturated-fat_100g": 0.0,
                    "sodium_100g": 0.002,
                    "proteins_100g": 0.7,
                }
            }
        }
        mock_get.return_value = mock_resp

        response = client.get("/api/v1/inspecionar/7891000100100")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("texto_preview", data)
        self.assertIn("payload_llm", data)
        self.assertEqual(data["payload_llm"]["product_name"], "Suco de Laranja Integral")
        self.assertEqual(data["payload_llm"]["nutriscore_grade"], "C")

    @patch("backend.main.requests.get")
    def test_inspecionar_produto_nao_encontrado_404(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"status": 0, "status_verbose": "product not found"}
        mock_get.return_value = mock_resp

        response = client.get("/api/v1/inspecionar/0000000000000")
        self.assertEqual(response.status_code, 404)
        self.assertIn("não cadastrado", response.json()["detail"])

    @patch("backend.main.ollama.Client")
    @patch("backend.main.requests.get")
    def test_analisar_com_ia_sucesso(self, mock_get, mock_ollama_client):
        # Mock do Open Food Facts
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "status": 1,
            "product": {
                "product_name": "Castanha do Pará",
                "brands": "Naturais",
                "nutriscore_grade": "a",
                "nova_group": 1,
                "ingredients_text_pt": "Castanhas do Pará descascadas.",
                "nutriments": {
                    "energy-kcal_100g": 650,
                    "sugars_100g": 2.3,
                    "saturated-fat_100g": 15.0,
                    "sodium_100g": 0.003,
                    "proteins_100g": 14.0,
                }
            }
        }
        mock_get.return_value = mock_resp

        # Mock do Ollama chat
        mock_client_instance = MagicMock()
        mock_client_instance.chat.return_value = {
            "message": {
                "content": '{"score_saude": 88, "resumo": "Excelente fonte de gorduras boas e selênio.", "pontos_positivos": ["Rica em selênio", "Alimento in natura"], "pontos_atencao": ["Alta densidade calórica"], "explicacao_detalhada": "Alimento natural de alto valor biológico."}'
            }
        }
        mock_ollama_client.return_value = mock_client_instance

        response = client.post("/api/v1/analisar-com-ia/7891234567890")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["score_saude"], 88)
        self.assertIn("selênio", data["resumo"])

    @patch("backend.main.ollama.Client")
    @patch("backend.main.requests.get")
    def test_analisar_com_ia_falha_ollama_500(self, mock_get, mock_ollama_client):
        # Mock do Open Food Facts
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "status": 1,
            "product": {
                "product_name": "Produto Teste",
                "nutriments": {}
            }
        }
        mock_get.return_value = mock_resp

        # Mock falha de conexão do Ollama
        mock_client_instance = MagicMock()
        mock_client_instance.chat.side_effect = ConnectionError("Could not connect to Ollama")
        mock_ollama_client.return_value = mock_client_instance

        response = client.post("/api/v1/analisar-com-ia/7891234567890")
        self.assertEqual(response.status_code, 500)
        self.assertIn("Falha na comunicação", response.json()["detail"])

if __name__ == "__main__":
    unittest.main()
