import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Modal,
  Platform,
  StatusBar,
  Linking,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

// ---------------------------------------------------------------------------
// Configuração de Rede: IP da máquina que executa o FastAPI
// ---------------------------------------------------------------------------
const DEFAULT_API_BASE = 'http://10.218.255.57:8000';

function normalizarUrlBackend(input) {
  if (!input) return DEFAULT_API_BASE;
  let url = input.trim().replace(/\/$/, '');
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }
  const semProtocolo = url.replace(/^https?:\/\//i, '');
  if (!semProtocolo.includes(':')) {
    url = `${url}:8000`;
  }
  return url;
}

export default function NutriScanner() {
  const [permission, requestPermission] = useCameraPermissions();
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_BASE);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualCodeInput, setManualCodeInput] = useState('');

  // Modos de operação: 'inspecao' (Sem IA) | 'ia' (Com IA Local)
  const [modo, setModo] = useState('inspecao');

  // Controle de estado e trava de escaneamento
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [barcodeScanned, setBarcodeScanned] = useState('');

  // Resultados
  const [inspecaoData, setInspecaoData] = useState(null);
  const [iaData, setIaData] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [showRawJson, setShowRawJson] = useState(false);

  // Solicita permissão automaticamente ao carregar
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission]);

  // -------------------------------------------------------------------------
  // Disparo ao Detectar Código de Barras (ou Digitação Manual)
  // -------------------------------------------------------------------------
  const processarCodigoDeBarras = async (codigo) => {
    if (!codigo || loading) return;

    setScanned(true);
    setLoading(true);
    setBarcodeScanned(codigo);
    setErrorMsg(null);
    setInspecaoData(null);
    setIaData(null);

    const cleanBaseUrl = normalizarUrlBackend(apiBaseUrl);

    try {
      if (modo === 'inspecao') {
        setLoadingMsg('Consultando Open Food Facts (Inspeção Direta)...');
        const response = await fetch(`${cleanBaseUrl}/api/v1/inspecionar/${codigo}`);

        if (response.status === 404) {
          throw new Error('Produto não cadastrado no Open Food Facts.');
        }
        if (!response.ok) {
          throw new Error(`Erro no servidor (${response.status})`);
        }

        const json = await response.json();
        setInspecaoData(json);
      } else {
        setLoadingMsg('Processando análise com IA local (Ollama)...');
        const response = await fetch(`${cleanBaseUrl}/api/v1/analisar-com-ia/${codigo}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (response.status === 404) {
          throw new Error('Produto não cadastrado no Open Food Facts.');
        }
        if (response.status === 500) {
          throw new Error('Falha de conexão com o Ollama local no backend.');
        }
        if (!response.ok) {
          throw new Error(`Erro na análise (${response.status})`);
        }

        const json = await response.json();
        setIaData(json);
      }
    } catch (err) {
      if (err.message && err.message.includes('Network request failed')) {
        setErrorMsg(
          `Não foi possível conectar ao backend em ${cleanBaseUrl}. Certifique-se de que o FastAPI está rodando na mesma rede Wi-Fi.`
        );
      } else {
        setErrorMsg(err.message || 'Falha ao conectar com o backend.');
      }
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  };

  const handleBarcodeScanned = ({ data }) => {
    if (scanned || loading) return;
    processarCodigoDeBarras(data);
  };

  const handleManualSubmit = () => {
    const limpo = manualCodeInput.trim();
    if (limpo) {
      setIsManualModalOpen(false);
      processarCodigoDeBarras(limpo);
    }
  };

  const resetScanner = () => {
    setScanned(false);
    setInspecaoData(null);
    setIaData(null);
    setErrorMsg(null);
    setBarcodeScanned('');
    setShowRawJson(false);
  };

  const getScoreColor = (score) => {
    if (score >= 70) return '#10B981'; // Verde
    if (score >= 40) return '#F59E0B'; // Amarelo
    return '#EF4444'; // Vermelho
  };

  // -------------------------------------------------------------------------
  // Tela de Permissão
  // -------------------------------------------------------------------------
  if (!permission) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.permissionTitle}>Permissão de Câmera Necessária</Text>
        <Text style={styles.permissionSubtitle}>
          O Nutrici-IA precisa acessar sua câmera para escanear os códigos de barra dos alimentos.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.buttonText}>Conceder Permissão</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: '#334155', marginTop: 12 }]}
          onPress={() => Linking.openSettings()}
        >
          <Text style={styles.buttonText}>Abrir Ajustes do Celular</Text>
        </TouchableOpacity>

        {/* Fallback para testar mesmo sem câmera */}
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: '#0284C7', marginTop: 12 }]}
          onPress={() => setIsManualModalOpen(true)}
        >
          <Text style={styles.buttonText}>⌨️ Testar com Código Manual</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Text style={styles.brandTitle}>
            Nutrici<Text style={styles.brandAccent}>-IA</Text>
          </Text>
          <TouchableOpacity
            style={styles.configIconButton}
            onPress={() => setIsConfigOpen(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.configIconText}>⚙️ IP</Text>
          </TouchableOpacity>
        </View>

        {/* Seletor de Modo: Inspeção Direta vs Análise com IA */}
        <View style={styles.modeSelectorContainer}>
          <TouchableOpacity
            style={[styles.modeTab, modo === 'inspecao' && styles.modeTabActive]}
            onPress={() => {
              setModo('inspecao');
              resetScanner();
            }}
            disabled={loading}
          >
            <Text style={[styles.modeTabText, modo === 'inspecao' && styles.modeTabTextActive]}>
              ⚡ Inspeção (Sem IA)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeTab, modo === 'ia' && styles.modeTabActive]}
            onPress={() => {
              setModo('ia');
              resetScanner();
            }}
            disabled={loading}
          >
            <Text style={[styles.modeTabText, modo === 'ia' && styles.modeTabTextActive]}>
              🧠 Análise com IA
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Câmera / Área de Escaneamento ou Área de Resultados */}
      <View style={styles.body}>
        {!scanned ? (
          <View style={styles.cameraWrapper}>
            {/* CameraView sem filhos (conforme exigido pelo Expo SDK 58) */}
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'],
              }}
              onBarcodeScanned={scanned || loading ? undefined : handleBarcodeScanned}
              onMountError={(error) => {
                console.warn('Erro na câmera:', error);
                setErrorMsg(`Erro ao acessar sensor da câmera: ${error?.message || 'Incompatível'}`);
              }}
            />

            {/* Mira visual posicionada em cima da câmera como irmão absoluto */}
            <View style={styles.overlay} pointerEvents="none">
              <View style={styles.scanTarget}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
              <Text style={styles.scanInstructions}>Aponte para o código de barras EAN-13</Text>
            </View>

            {/* Botão flutuante para digitar código manualmente (ótimo para testes) */}
            <TouchableOpacity
              style={styles.manualCodeButton}
              onPress={() => setIsManualModalOpen(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.manualCodeButtonText}>⌨️ Digitar Código Manualmente</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.resultScrollContainer}>
            <View style={styles.badgeBar}>
              <Text style={styles.badgeText}>Código: {barcodeScanned}</Text>
            </View>

            {/* Spinner durante processamento */}
            {loading && (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color="#10B981" />
                <Text style={styles.loadingText}>{loadingMsg}</Text>
              </View>
            )}

            {/* Mensagem de Erro */}
            {errorMsg && (
              <View style={styles.errorCard}>
                <Text style={styles.errorTitle}>Atenção</Text>
                <Text style={styles.errorBody}>{errorMsg}</Text>
              </View>
            )}

            {/* Resultado do Modo Inspeção Direta */}
            {inspecaoData && (
              <View style={styles.resultCard}>
                <Text style={styles.cardHeaderTitle}>Inspeção Direta (Open Food Facts)</Text>
                <View style={styles.previewBox}>
                  <Text style={styles.previewText}>{inspecaoData.texto_preview}</Text>
                </View>

                <TouchableOpacity
                  style={styles.toggleJsonBtn}
                  onPress={() => setShowRawJson(!showRawJson)}
                >
                  <Text style={styles.toggleJsonText}>
                    {showRawJson ? '▲ Ocultar Payload JSON' : '▼ Ver Payload JSON Filtrado'}
                  </Text>
                </TouchableOpacity>

                {showRawJson && (
                  <View style={styles.jsonBox}>
                    <Text style={styles.jsonText}>
                      {JSON.stringify(inspecaoData.payload_llm, null, 2)}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Resultado do Modo Análise com IA */}
            {iaData && (
              <View style={styles.resultCard}>
                <View style={styles.scoreRow}>
                  <View style={[styles.scoreCircle, { borderColor: getScoreColor(iaData.score_saude) }]}>
                    <Text style={[styles.scoreNumber, { color: getScoreColor(iaData.score_saude) }]}>
                      {iaData.score_saude}
                    </Text>
                    <Text style={styles.scoreScale}>/100</Text>
                  </View>
                  <View style={styles.scoreSummaryBox}>
                    <Text style={styles.scoreVerdict}>
                      {iaData.score_saude >= 70
                        ? 'Alimento Saudável'
                        : iaData.score_saude >= 40
                        ? 'Consumir com Moderação'
                        : 'Ultraprocessado / Alerta'}
                    </Text>
                    <Text style={styles.summaryText}>{iaData.resumo}</Text>
                  </View>
                </View>

                {iaData.pontos_positivos?.length > 0 && (
                  <View style={styles.sectionBox}>
                    <Text style={styles.sectionTitlePositive}>✓ Pontos Positivos</Text>
                    {iaData.pontos_positivos.map((item, idx) => (
                      <Text key={idx} style={styles.bulletItemPositive}>• {item}</Text>
                    ))}
                  </View>
                )}

                {iaData.pontos_atencao?.length > 0 && (
                  <View style={styles.sectionBox}>
                    <Text style={styles.sectionTitleWarning}>⚠ Pontos de Atenção</Text>
                    {iaData.pontos_atencao.map((item, idx) => (
                      <Text key={idx} style={styles.bulletItemWarning}>• {item}</Text>
                    ))}
                  </View>
                )}

                <View style={styles.sectionBox}>
                  <Text style={styles.sectionTitle}>Parecer do Nutricionista IA</Text>
                  <Text style={styles.explanationText}>{iaData.explicacao_detalhada}</Text>
                </View>
              </View>
            )}

            {/* Botão para Nova Leitura */}
            <TouchableOpacity style={styles.rescanButton} onPress={resetScanner} disabled={loading}>
              <Text style={styles.rescanButtonText}>📷 Escanear Outro Produto</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>

      {/* Modal de Configuração de IP */}
      <Modal visible={isConfigOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Configurar IP do Backend</Text>
            <Text style={styles.modalSubtitle}>
              Insira o IP da sua máquina ou link do túnel (ex: http://172.16.0.79:8000):
            </Text>
            <TextInput
              style={styles.modalInput}
              value={apiBaseUrl}
              onChangeText={setApiBaseUrl}
              placeholder="http://172.16.0.79:8000"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={styles.modalSaveButton} onPress={() => setIsConfigOpen(false)}>
                <Text style={styles.buttonText}>Salvar Endereço</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal para Entrada Manual de Código de Barras */}
      <Modal visible={isManualModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Digitar Código de Barras</Text>
            <Text style={styles.modalSubtitle}>
              Digite o número do código de barras (EAN-13) ou toque em um exemplo:
            </Text>
            <TextInput
              style={styles.modalInput}
              value={manualCodeInput}
              onChangeText={setManualCodeInput}
              placeholder="Ex: 7891000100100"
              keyboardType="numeric"
            />

            {/* Chips de Exemplo para Teste Imediato */}
            <View style={styles.exampleChipsRow}>
              <TouchableOpacity
                style={styles.chipButton}
                onPress={() => setManualCodeInput('7891000100100')}
              >
                <Text style={styles.chipText}>Nescau</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.chipButton}
                onPress={() => setManualCodeInput('5449000000996')}
              >
                <Text style={styles.chipText}>Coca-Cola</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.chipButton}
                onPress={() => setManualCodeInput('3017620422003')}
              >
                <Text style={styles.chipText}>Nutella</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={[styles.modalSaveButton, { backgroundColor: '#475569', marginRight: 10 }]}
                onPress={() => setIsManualModalOpen(false)}
              >
                <Text style={styles.buttonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveButton} onPress={handleManualSubmit}>
                <Text style={styles.buttonText}>Analisar Código</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 24,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#0F172A',
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginBottom: 8,
    textAlign: 'center',
  },
  permissionSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  brandAccent: {
    color: '#10B981',
  },
  configIconButton: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: '#334155',
    borderRadius: 8,
  },
  configIconText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
  },
  modeSelectorContainer: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 3,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  modeTabActive: {
    backgroundColor: '#10B981',
  },
  modeTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
  modeTabTextActive: {
    color: '#FFFFFF',
  },
  body: {
    flex: 1,
  },
  cameraWrapper: {
    flex: 1,
    backgroundColor: '#000000',
    position: 'relative',
  },
  camera: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanTarget: {
    width: 260,
    height: 180,
    position: 'relative',
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: '#10B981',
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 },
  scanInstructions: {
    marginTop: 20,
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '500',
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  manualCodeButton: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.95)',
    borderWidth: 1,
    borderColor: '#475569',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
  },
  manualCodeButtonText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
  },
  exampleChipsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  chipButton: {
    backgroundColor: '#334155',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  chipText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '600',
  },
  resultScrollContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  badgeBar: {
    alignSelf: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
  },
  badgeText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  loadingBox: {
    alignItems: 'center',
    padding: 30,
  },
  loadingText: {
    marginTop: 12,
    color: '#E2E8F0',
    fontSize: 14,
    textAlign: 'center',
  },
  errorCard: {
    backgroundColor: '#7F1D1D',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorTitle: {
    color: '#FCA5A5',
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 4,
  },
  errorBody: {
    color: '#FEE2E2',
    fontSize: 14,
  },
  resultCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 12,
  },
  previewBox: {
    backgroundColor: '#0F172A',
    padding: 14,
    borderRadius: 10,
    marginBottom: 12,
  },
  previewText: {
    color: '#E2E8F0',
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'monospace',
  },
  toggleJsonBtn: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  toggleJsonText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '600',
  },
  jsonBox: {
    backgroundColor: '#0B1120',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  jsonText: {
    color: '#94A3B8',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  scoreCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  scoreNumber: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  scoreScale: {
    fontSize: 10,
    color: '#94A3B8',
  },
  scoreSummaryBox: {
    flex: 1,
  },
  scoreVerdict: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  summaryText: {
    color: '#CBD5E1',
    fontSize: 13,
  },
  sectionBox: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  sectionTitle: {
    color: '#F8FAFC',
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 6,
  },
  sectionTitlePositive: {
    color: '#34D399',
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 6,
  },
  sectionTitleWarning: {
    color: '#FBBF24',
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 6,
  },
  bulletItemPositive: {
    color: '#A7F3D0',
    fontSize: 13,
    marginBottom: 4,
    lineHeight: 18,
  },
  bulletItemWarning: {
    color: '#FDE68A',
    fontSize: 13,
    marginBottom: 4,
    lineHeight: 18,
  },
  explanationText: {
    color: '#E2E8F0',
    fontSize: 13,
    lineHeight: 20,
  },
  rescanButton: {
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  rescanButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: '#10B981',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F8FAFC',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#F8FAFC',
    fontSize: 14,
    marginBottom: 16,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalSaveButton: {
    backgroundColor: '#10B981',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
});
