
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

## 🛡️ Politica de Privacidade
Política de Privacidade — Polyglot
1. Informações gerais
O Polyglot (“Aplicativo”) oferece ferramentas de aprendizado de idiomas, incluindo exercícios de fala que utilizam o microfone do dispositivo. Esta Política de Privacidade descreve como tratamos informações dos usuários, quais dados são coletados, como são utilizados e quais direitos você possui ao utilizar o aplicativo.
2. Dados coletados
2.1. Dados fornecidos pelo usuário
O Polyglot não solicita cadastro e não coleta informações pessoais como nome, e-mail, telefone ou documentos.
2.2. Dados coletados automaticamente
O aplicativo pode coletar informações técnicas e de uso, como:
•	Tipo e modelo do dispositivo
•	Sistema operacional
•	Versão do aplicativo
•	Idioma do dispositivo
•	Dados de uso (telas acessadas, tempo de uso, interações gerais)
Esses dados são anônimos e utilizados apenas para melhorar o funcionamento do app.
2.3. Uso do microfone
O Polyglot solicita acesso ao microfone exclusivamente para:
•	Exercícios de pronúncia
•	Reconhecimento de fala
•	Avaliação de desempenho linguístico em tempo real
O aplicativo não grava, não armazena e não envia áudios para servidores próprios.
O processamento de voz pode ocorrer localmente no dispositivo ou por serviços de terceiros (como APIs de reconhecimento de fala), dependendo da configuração do sistema operacional.
Nenhuma gravação é mantida após o término do exercício.
3. Como os dados são utilizados
Os dados coletados são usados para:
•	Permitir o funcionamento dos recursos de fala
•	Melhorar a precisão do reconhecimento de voz
•	Aperfeiçoar a experiência do usuário
•	Garantir estabilidade e compatibilidade do aplicativo
O Polyglot não vende e não compartilha dados pessoais com terceiros para fins comerciais.
4. Serviços de terceiros
O aplicativo pode utilizar serviços como:
•	Google Play Services
•	APIs de reconhecimento de fala do Android
•	Firebase Analytics (se aplicável)
•	AdMob (somente se houver anúncios)
Esses serviços podem coletar dados conforme suas próprias políticas. Consulte:
•	Google: https://policies.google.com/privacy
•	Firebase: https://firebase.google.com/support/privacy
5. Armazenamento e segurança
O Polyglot não armazena gravações de voz.
Dados técnicos e estatísticos são protegidos por medidas de segurança adequadas e utilizados apenas para os fins descritos nesta política.
6. Direitos do usuário
Você pode:
•	Revogar a permissão de microfone a qualquer momento nas configurações do dispositivo
•	Solicitar esclarecimentos sobre o tratamento de dados
•	Desinstalar o aplicativo, interrompendo toda coleta de dados
7. Privacidade de crianças
O Polyglot pode ser utilizado por crianças, mas não coleta dados pessoais identificáveis. Caso você seja responsável por uma criança e tenha dúvidas sobre o uso do microfone ou coleta de dados, entre em contato conosco.
8. Alterações nesta política
Esta Política de Privacidade pode ser atualizada periodicamente. A versão mais recente estará sempre disponível na URL pública informada na Google Play Store.
9. Contato
Para dúvidas sobre esta Política de Privacidade:
E-mail: marciofmaciel@gmail.com
Privacy Policy — Polyglot
1. General Information
Polyglot (“Application”) provides language learning tools, including speaking exercises that use the device’s microphone. This Privacy Policy describes how we handle user information, what data is collected, how it is used, and what rights you have when using the application.
2. Data Collected
2.1. Data Provided by the User
Polyglot does not require registration and does not collect personal information such as name, email, phone number, or documents.
2.2. Automatically Collected Data
The application may collect technical and usage information, such as:
•	Device type and model
•	Operating system
•	Application version
•	Device language
•	Usage data (screens accessed, time spent, general interactions)
This data is anonymous and used solely to improve the app’s functionality.
2.3. Microphone Usage
Polyglot requests access to the microphone exclusively for:
•	Pronunciation exercises
•	Speech recognition
•	Real time language performance evaluation
The application does not record, store, or send audio to its own servers.
Voice processing may occur locally on the device or through third party services (such as speech recognition APIs), depending on the operating system configuration.
No recordings are kept after the exercise ends.
3. How the Data Is Used
Polyglot does not sell or share personal data with third parties for commercial purposes.
4. Third Party Services
The application may use services such as:
•	Google Play Services
•	Android Speech Recognition APIs
•	Firebase Analytics (if applicable)
•	AdMob (only if ads are displayed)
These services may collect data according to their own privacy policies. See:
•	Google: https://policies.google.com/privacy
•	Firebase: https://firebase.google.com/support/privacy
5. Data Storage and Security
Polyglot does not store voice recordings.
Technical and statistical data is protected by appropriate security measures and used only for the purposes described in this policy.
6. User Rights
You may:
•	Revoke microphone permission at any time in your device settings
•	Request clarification about data handling
•	Uninstall the application, stopping all data collection
7. Children’s Privacy
Polyglot may be used by children, but it does not collect personally identifiable information. If you are a parent or guardian and have questions about microphone usage or data collection, please contact us.
8. Changes to This Policy
This Privacy Policy may be updated periodically. The most recent version will always be available at the public URL provided in the Google Play Store.
9. Contact
For questions about this Privacy Policy:
Email: marciofmaciel@gmail.com
