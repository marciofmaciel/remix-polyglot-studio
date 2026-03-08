
# 🎙️ Polyglot Studio AI

**Polyglot Studio** é um motor de tradução simultânea de ultra-baixa latência projetado para conversas fluidas entre falantes de diferentes idiomas. Utilizando a **Gemini 2.5 Live API**, o aplicativo transforma o seu navegador em uma cabine de tradução profissional.

![Status do Projeto](https://img.shields.io/badge/Status-Pronto_para_Produ%C3%A7%C3%A3o-brightgreen)
![Tecnologia](https://img.shields.io/badge/AI-Gemini_2.5_Flash-blue)
![PWA](https://img.shields.io/badge/Mobile-APK_Ready-orange)

## ✨ Funcionalidades

- **Tradução em Tempo Real**: Conversão de voz para voz instantânea sem atrasos perceptíveis.
- **Interface Estúdio**: Visualizadores de áudio (Pulse) para entrada (usuário) e saída (IA).
- **Modo Alternado (Toggle)**: Clique único para gravar e clique final para processar a tradução.
- **Interrupção Manual**: Controle total para parar o processamento ou áudio a qualquer momento.
- **PWA / APK-Ready**: Instalável em dispositivos Android como um aplicativo nativo.
- **Suporte Multi-idioma**: Português, Inglês, Espanhol, Francês, Alemão, Japonês, Chinês e Italiano.

## 🚀 Tecnologias Utilizadas

- [React 19](https://react.dev/)
- [@google/genai (Gemini 2.5 Live API)](https://ai.google.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Service Workers & PWA Manifest](https://web.dev/progressive-web-apps/)

## 🛠️ Instalação e Uso

1. **Requisitos**: Node.js instalado e uma chave de API do Google AI Studio.

2. **Clone o repositório**:
   ```bash
   git clone https://github.com/seu-usuario/polyglot-studio.git
   ```

3. **Configure a API Key**:
   O aplicativo consome a chave de `process.env.API_KEY`. Certifique-se de configurá-la no seu ambiente de hospedagem.

4. **Rodando Localmente**:
   ```bash
   npm install
   npm run dev
   ```

## 📱 Transformando em APK (Android)

Este projeto é um PWA completo. Para usá-lo como aplicativo:
1. Hospede o site (Vercel, GitHub Pages, etc).
2. Abra no Chrome do Android.
3. Clique em "Adicionar à tela de início" ou "Instalar Aplicativo".

## 🛡️ Licença

Este projeto está sob a licença MIT. Sinta-se livre para usar e modificar.

---
*Desenvolvido com foco em UX e performance por um Engenheiro Sênior.*
