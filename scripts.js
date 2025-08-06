import { $ } from "./dom.js";

class GoogleTranslate {
  static SUPPORTED_LANGUAGES = [
    "en",
    "es",
    "fr",
    "de",
    "it",
    "pt",
    "ru",
    "zh",
    "ja",
    "ko",
    "ar",
    "hi",
    "tr",
    "pl",
    "nl",
    "sv",
  ];

  static FULL_LANGUAGES_CODE = {
    en: "en-US",
    es: "es-ES",
    fr: "fr-FR",
    de: "de-DE",
    it: "it-IT",
    pt: "pt-PT",
    ru: "ru-RU",
    zh: "zh-CN",
    ja: "ja-JP",
    ko: "ko-KR",
    ar: "ar-SA",
    hi: "hi-IN",
    tr: "tr-TR",
    pl: "pl-PL",
    nl: "nl-NL",
    sv: "sv-SE",
  };

  static DEFAULT_SOURCE_LANGUAGE = "es";
  static DEFAULT_TARGET_LANGUAGE = "en";
  constructor() {
    this.init();
    this.setupEventListeners();
    this.translationTimeout = null;
    this.currentTranslator = null;
    this.currentTranslatorKey = null;
    this.currentDetector = null;
  }
  init() {
    //recuperar los elementos del DOM
    this.inputText = $("#inputText");
    this.outputText = $("#outputText");

    this.sourceLanguage = $("#sourceLanguage");
    this.targetLanguage = $("#targetLanguage");

    this.micButton = $("#micButton");
    this.copyButton = $("#copyButton");
    this.speakButton = $("#speakButton");
    this.swapLanguages = $("#swapLanguages");

    //configuracion Inicial
    this.targetLanguage.value = GoogleTranslate.DEFAULT_TARGET_LANGUAGE;

    //verificar que el usuario tiene soporte para la api
    this.checkAPISupport();
  }

  checkAPISupport() {
    this.hasNativeTranstor = "Translator" in window;
    this.hasNativeDetector = "LanguageDetector" in window;

    if (!this.hasNativeTranstor || !this.hasNativeDetector) {
      const warningMessage = document.createElement("div");
      warningMessage.className = "warning-message";
      warningMessage.innerHTML = `
                <div class="warning-content">
                    <span class="material-symbols-outlined">warning</span>
                    <p>Este navegador no es compatible con las APIs nativas de traducción.</p>
                </div>`;

      document.body.appendChild(warningMessage);

      // Añadir estilos para el mensaje de advertencia
      const style = document.createElement("style");
      style.textContent = `
                .warning-message {
                    position: fixed;
                    top: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    background-color: var(--warning-bg);
                    color: var(--warning-text);
                    border: 1px solid var(--warning-border);
                    padding: 16px;
                    border-radius: 8px;
                    z-index: 1000;
                    animation: fadeIn 0.3s, fadeOut 0.3s 5s forwards;
                }
                .warning-content {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translate(-50%, -20px); }
                    to { opacity: 1; transform: translate(-50%, 0); }
                }
                @keyframes fadeOut {
                    from { opacity: 1; transform: translate(-50%, 0); }
                    to { opacity: 0; transform: translate(-50%, -20px); }
                }
            `;
      document.head.appendChild(style);

      // Eliminar el mensaje después de 5 segundos
      setTimeout(() => {
        warningMessage.remove();
        style.remove();
      }, 5000);

      console.warn(
        "API nativas de detección de idioma no soportadas en este navegador."
      );
    } else {
      console.log(
        "API nativas de detección de idioma soportadas en este navegador."
      );
    }
  }

  setupEventListeners() {
    this.inputText.addEventListener("input", () => {
      this.debounceTranslate();
    });
    this.sourceLanguage.addEventListener("change", () => {
      this.translate();
    });

    this.targetLanguage.addEventListener("change", () => {
      this.translate();
    });

    this.swapLanguages.addEventListener("click", () => {
      this.swapLanguagesButton();
    });

    this.micButton.addEventListener("click", () => {
      this.startVoiceRecognition();
    });

    this.speakButton.addEventListener("click", () => {
      this.speaketranslation();
    });

    this.copyButton.addEventListener("click", () => {
      this.handleCopy();
    });
  }

  debounceTranslate() {
    clearTimeout(this.translationTimeout);
    this.translationTimeout = setTimeout(() => {
      this.translate();
    }, 500);
  }

  updateDetectedLanguage(detectedLanguage) {
    console.log("Actualizando idioma detectado:", detectedLanguage);

    // Buscar la opción del idioma detectado
    const option = this.sourceLanguage.querySelector(
      `option[value="${detectedLanguage}"]`
    );

    // Obtener el texto del idioma
    let languageText = "";
    if (option) {
      languageText = option.textContent;
    } else {
      // Si no encontramos la opción, usar el código del idioma
      languageText = detectedLanguage.toUpperCase();
    }

    // Actualizar el texto de la opción "auto"
    const autoOption = this.sourceLanguage.querySelector(
      'option[value="auto"]'
    );
    if (autoOption) {
      autoOption.textContent = `Detectar idioma (${languageText})`;
    } else {
      console.warn("No se encontró la opción 'auto' en el selector de idioma");
    }
  }

  async getTranslation(text) {
    // Obtener y validar el idioma de origen
    let sourceLanguage = this.sourceLanguage.value;
    if (sourceLanguage === "auto") {
      sourceLanguage = await this.detectLanguage(text);
    }

    const targetLanguage = this.targetLanguage.value;

    // Validar que ambos idiomas sean válidos
    if (!sourceLanguage || !targetLanguage) {
      throw new Error("Idiomas de origen o destino no válidos");
    }

    // Validar que los idiomas estén en la lista de soportados
    if (
      !GoogleTranslate.SUPPORTED_LANGUAGES.includes(sourceLanguage) ||
      !GoogleTranslate.SUPPORTED_LANGUAGES.includes(targetLanguage)
    ) {
      throw new Error(
        `Idioma no soportado: ${sourceLanguage} -> ${targetLanguage}`
      );
    }

    if (sourceLanguage === targetLanguage) return text;

    if (!this.hasNativeTranstor || !this.hasNativeDetector) {
      throw new Error(
        "Este navegador no es compatible con las APIs nativas de traducción"
      );
    }
    //revisa si tenemos disponible esta traducción
    try {
      const status = await window.Translator.availability({
        sourceLanguage,
        targetLanguage,
      });

      console.log("Estado del traductor:", status);

      if (status !== "available" && status !== "downloadable") {
        throw new Error(
          `Traducción de ${sourceLanguage} a ${targetLanguage} no disponible. Estado: ${status}`
        );
      }
    } catch (error) {
      console.error("Error al verificar disponibilidad de traducción:", error);
      throw new Error(
        `traduccion de ${sourceLanguage} a ${targetLanguage} no disponible`
      );
    }

    const translatorKey = `${sourceLanguage}-${targetLanguage}`;

    try {
      if (
        !this.currentTranslator ||
        this.currentTranslator.key !== translatorKey
      ) {
        if (this.currentTranslator) {
          this.currentTranslator.destroy();
        }
      }
      {
        this.currentTranslator = await window.Translator.create({
          sourceLanguage,
          targetLanguage,
          monitor: (monitor) => {
            monitor.addEventListener("downloadprogress", (e) => {
              this.outputText.innerHTML = `<span class="loading">Cargando modelo de traducción... ${Math.floor(
                e.loaded * 100
              )}%</span>`;
            });
          },
        });
      }
      this.currentTranslatorKey = translatorKey;
      const translation = await this.currentTranslator.translate(text);
      return translation;
    } catch (error) {
      console.error("Error al crear el traductor:", error);
      throw new Error(
        `Error al crear el traductor de ${sourceLanguage} a ${targetLanguage}`
      );
    }
  }

  async translate() {
    const text = this.inputText.value.trim();
    if (!text) {
      this.outputText.textContent = "";
      return;
    }
    this.outputText.textContent = "Traduciendo...";

    if (this.sourceLanguage.value === "auto") {
      const detectedLanguage = await this.detectLanguage(text);
      this.updateDetectedLanguage(detectedLanguage);
    }
    try {
      const translation = await this.getTranslation(text);
      this.outputText.textContent = translation;
    } catch (error) {
      console.error("Error al traducir:", error);
      const hasSupport = this.checkAPISupport();
      if (!hasSupport) {
        this.outputText.textContent =
          "error No tienes Soporte Nativo en tu navegador para traduccion con IA";
      }
    }
  }

  async swapLanguagesButton() {
    try {
      // Si el idioma de origen es "auto" y hay texto, detectar el idioma primero
      if (this.sourceLanguage.value === "auto" && this.inputText.value.trim()) {
        const detectedLanguage = await this.detectLanguage(
          this.inputText.value
        );
        if (detectedLanguage) {
          this.sourceLanguage.value = detectedLanguage;
        }
      }

      const sourceValue = this.sourceLanguage.value;
      const targetValue = this.targetLanguage.value;

      if (!sourceValue || !targetValue) {
        console.warn("Valores de idioma inválidos:", {
          source: sourceValue,
          target: targetValue,
        });
        return;
      }

      // Intercambiar los valores de los selectores
      this.sourceLanguage.value = targetValue;
      this.targetLanguage.value =
        sourceValue === "auto"
          ? GoogleTranslate.DEFAULT_SOURCE_LANGUAGE
          : sourceValue;

      // Intercambiar el texto
      const tempText = this.inputText.value;
      this.inputText.value = this.outputText.textContent || "";
      this.outputText.textContent = tempText;

      // Solo traducir si hay texto
      if (this.inputText.value.trim()) {
        await this.translate();
      }
    } catch (error) {
      console.error("Error al intercambiar idiomas:", error);
      this.outputText.textContent = "Error al intercambiar idiomas";
    }
  }

  getFullLanguageCode(languageCode) {
    return (
      GoogleTranslate.FULL_LANGUAGES_CODE[languageCode] ??
      GoogleTranslate.DEFAULT_SOURCE_LANGUAGE
    );
  }

  speaketranslation() {
    const hasNativeSupportSynthesis = "speechSynthesis" in window;
    if (!hasNativeSupportSynthesis) {
      console.warn("El navegador no soporta la síntesis de voz");
      return;
    }

    const text = this.outputText.textContent.trim();
    if (!text) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    const targetLang = this.targetLanguage.value;
    utterance.lang = this.getFullLanguageCode(targetLang);

    utterance.rate = 0.9;

    utterance.onstart = () => {
      console.log("Iniciando síntesis de voz en:", utterance.lang);
      this.speakButton.style.backgroundColor = "var(--google-green)";
      this.speakButton.style.color = "white";
    };

    utterance.onend = () => {
      console.log("Síntesis de voz finalizada");
      this.speakButton.style.backgroundColor = "";
      this.speakButton.style.color = "";
    };

    utterance.onerror = (event) => {
      console.error("Error en la síntesis de voz:", event);
      this.speakButton.style.backgroundColor = "";
      this.speakButton.style.color = "";
    };

    window.speechSynthesis.speak(utterance);
  }
  async startVoiceRecognition() {
    try {
      // Verificar soporte para reconocimiento de voz
      if (
        !("SpeechRecognition" in window) &&
        !("webkitSpeechRecognition" in window)
      ) {
        throw new Error("Tu navegador no soporta el reconocimiento de voz");
      }

      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();

      // Configurar el reconocimiento
      recognition.continuous = false;
      recognition.interimResults = false;

    
      let language;
      if (this.sourceLanguage.value === "auto") {
        language = navigator.language.split("-")[0] || "en";
      } else {
        language = this.sourceLanguage.value;
      }

      recognition.lang = this.getFullLanguageCode(language);

      recognition.onstart = () => {
        console.log("Reconocimiento de voz iniciado");
        this.micButton.classList.add("recording");
        this.micButton.style.backgroundColor = "var(--google-red)";
        this.micButton.style.color = "white";
        this.outputText.textContent = "Escuchando...";
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        console.log("Texto reconocido:", transcript);
        this.inputText.value = transcript;
        this.translate();
      };

      recognition.onerror = (event) => {
        console.error("Error en el reconocimiento de voz:", event.error);
        this.outputText.textContent = "Error: " + event.error;
        this.micButton.classList.remove("recording");
        this.micButton.style.backgroundColor = "";
        this.micButton.style.color = "";
      };

      recognition.onend = () => {
        console.log("Reconocimiento de voz finalizado");
        this.micButton.classList.remove("recording");
        this.micButton.style.backgroundColor = "";
        this.micButton.style.color = "";
      };

      await recognition.start();
    } catch (error) {
      console.error("Error al iniciar el reconocimiento de voz:", error);
      this.outputText.textContent = "Error al iniciar el reconocimiento de voz";
      this.micButton.classList.remove("recording");
      this.micButton.style.backgroundColor = "";
      this.micButton.style.color = "";
    }
  }

  handleCopy() {
    const text = this.outputText.textContent.trim();
    if (!text) return;

    navigator.clipboard.writeText(text).then(() => {
      this.copyButton.style.backgroundColor = "var(--google-green)";
      this.copyButton.style.color = "white";

      setTimeout(() => {
        this.copyButton.style.backgroundColor = "";
        this.copyButton.style.color = "";
      }, 1000);
    });
  }
  async detectLanguage(text) {
    try {
      if (!this.currentDetector) {
        console.log("Creando nuevo detector de idioma...");
        this.currentDetector = await window.LanguageDetector.create({
          expectedInputLanguages: GoogleTranslate.SUPPORTED_LANGUAGES,
        });
      }

      const results = await this.currentDetector.detect(text);

      if (!results || results.length === 0) {
        console.warn("No se obtuvieron resultados de detección");
        return GoogleTranslate.DEFAULT_SOURCE_LANGUAGE;
      }

      const detectedLanguage = results[0]?.detectedLanguage;

      return detectedLanguage === "und"
        ? GoogleTranslate.DEFAULT_SOURCE_LANGUAGE
        : detectedLanguage;
    } catch (error) {
      console.error("Error al detectar el idioma:", error);

      // Si hay un error con el detector, intentamos recrearlo
      if (this.currentDetector) {
        try {
          await this.currentDetector.destroy();
        } catch (e) {
          console.warn("Error al destruir el detector:", e);
        }
        this.currentDetector = null;
      }

      return GoogleTranslate.DEFAULT_SOURCE_LANGUAGE;
    }
  }
}

const googleTranslate = new GoogleTranslate();
