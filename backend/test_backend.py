import unittest
import json
from pydantic import ValidationError
from backend.main import (
    filtrar_payload_nutricional,
    gerar_texto_preview,
    AnaliseNutricional,
    InspecaoResponse,
)

class TestNutriciIABackend(unittest.TestCase):
    def setUp(self):
        self.mock_openfoodfacts_raw = {
            "product_name": "Iogurte Natural Integral",
            "brands": "Marca Exemplo",
            "nutriscore_grade": "a",
            "nova_group": 1,
            "ingredients_text_pt": "Leite integral pasteurizado e fermentos lácteos.",
            "nutriments": {
                "energy-kcal_100g": 62,
                "sugars_100g": 4.5,
                "saturated-fat_100g": 2.0,
                "sodium_100g": 0.05,
                "proteins_100g": 3.8,
            }
        }

    def test_filtro_payload_nutricional(self):
        filtrado = filtrar_payload_nutricional(self.mock_openfoodfacts_raw)
        self.assertEqual(filtrado["product_name"], "Iogurte Natural Integral")
        self.assertEqual(filtrado["brands"], "Marca Exemplo")
        self.assertEqual(filtrado["nutriscore_grade"], "A")
        self.assertEqual(filtrado["nova_group"], 1)
        self.assertIn("Leite integral", filtrado["ingredients_text_pt"])
        self.assertEqual(filtrado["nutriments"]["calorias_kcal_100g"], 62)
        self.assertEqual(filtrado["nutriments"]["acucares_100g"], 4.5)

    def test_gerar_texto_preview(self):
        filtrado = filtrar_payload_nutricional(self.mock_openfoodfacts_raw)
        preview = gerar_texto_preview(filtrado)
        self.assertIn("PRODUTO: Iogurte Natural Integral", preview)
        self.assertIn("Nutri-Score: A", preview)
        self.assertIn("62 kcal", preview)
        self.assertIn("Leite integral", preview)

    def test_pydantic_schema_analise_nutricional(self):
        dados_llm = {
            "score_saude": 90,
            "resumo": "Excelente alimento fermentado, fonte de proteínas e sem açúcares adicionados.",
            "pontos_positivos": ["Rico em cálcio e proteínas", "Sem aditivos ou conservantes"],
            "pontos_atencao": ["Contém lactose (atenção para intolerantes)"],
            "explicacao_detalhada": "Alimento minimamente processado (NOVA 1) com excelente perfil nutricional."
        }
        modelo = AnaliseNutricional.model_validate(dados_llm)
        self.assertEqual(modelo.score_saude, 90)
        self.assertEqual(len(modelo.pontos_positivos), 2)

    def test_pydantic_schema_invalid_score(self):
        dados_invalidos = {
            "score_saude": 150,  # Maior que 100
            "resumo": "Teste",
            "pontos_positivos": [],
            "pontos_atencao": [],
            "explicacao_detalhada": "Teste"
        }
        with self.assertRaises(ValidationError):
            AnaliseNutricional.model_validate(dados_invalidos)

if __name__ == "__main__":
    unittest.main()
