# Bright Mind Chat

Web chat សម្រាប់ជជែកជាក្រុម និងចែករំលែកឯកសារ។ Backend ប្រើ Socket.IO សម្រាប់សារភ្លាមៗ និង SQLite សម្រាប់រក្សាប្រវត្តិសារ។

## ត្រូវមាន

- Node.js 22.13 ឬថ្មីជាងនេះ (បានសាកល្បងជាមួយ Node.js 24)
- npm

## ដំណើរការលើកុំព្យូទ័រមួយ

```powershell
npm install
npm run dev
```

បើក `http://localhost:5173` ក្នុង browser។ `npm run dev` បើក frontend និង chat server ជាមួយគ្នា។

## ឱ្យឧបករណ៍ផ្សេងក្នុង Wi-Fi ចូលរួម

1. ភ្ជាប់ laptop ដែលបើក server និងទូរស័ព្ទរបស់អ្នកប្រើទាំងអស់ទៅ Wi-Fi ដូចគ្នា។ Laptop ត្រូវបើកជានិច្ចក្នុងពេល chat។
2. រក IP address របស់ laptop ដោយបើក PowerShell ហើយវាយ `ipconfig`។ រក IPv4 Address របស់ Wi-Fi adapter ឧទាហរណ៍ `192.168.1.20`។
3. លើទូរស័ព្ទផ្សេងៗ បើក `http://192.168.1.20:5173` ដោយប្ដូរទៅ IP របស់ laptop ពិតប្រាកដ។
4. បើ Windows Firewall សួរ សូមអនុញ្ញាត Node.js លើ Private network។ បើឧបករណ៍មិនឃើញគ្នា សូមពិនិត្យថា Wi-Fi មិនបានបើក AP/client isolation និងអ្នកទាំងអស់ស្ថិតនៅ network ដូចគ្នា។

របៀបនេះអាចប្រើបានទោះ Wi-Fi មិនមាន internet ក៏ដោយ ព្រោះ laptop ជា server នៅក្នុងបណ្ដាញផ្ទាល់។ Router តែមួយមុខមិនអាចរក្សាទុក ឬបញ្ជូនសារបានទេ។

## ដំណើរការជា server តែមួយ

```powershell
npm run build
npm start
```

បន្ទាប់មកចូលតាម `http://localhost:3001` ឬតាម `http://<IP របស់ laptop>:3001` ពីឧបករណ៍ក្នុង Wi-Fi។ អាចកំណត់ port ដោយប្រើ environment variable `PORT`។

## ដាក់លើ internet

Build និង run app នេះលើ hosting ដែលអាចរក្សា Node.js process ឱ្យដំណើរការជាប់ និងគាំទ្រ WebSocket។ កំណត់ `PORT` តាម hosting រួចបើក HTTPS នៅ reverse proxy/hosting។ បើចង់ប្រើបានទាំង internet និង LAN ពេល internet ដាច់ ត្រូវបើក local server ក្នុង LAN ផង; ការប្រវត្តិសាររវាង cloud និង local server មិនបាន sync ដោយស្វ័យប្រវត្តិក្នុងកំណែនេះទេ។

## Supabase database setup

1. Open the Supabase project: https://supabase.com/dashboard/project/lcalezqqjbhukjimucvb
2. Copy the project URL and the anon/service-role key from Project Settings → API.
3. Create a local `.env` file in the project root using the template in `.env.example`.
4. Start the app:

```powershell
npm install
npm run dev
```

This only configures and checks whether the Supabase API is reachable. Chat data is still stored in the local SQLite database (`data/bright-mind.sqlite`); the app has not yet been migrated to use Supabase for messages, groups, or profiles.

## ការរក្សាទុក និងកំណត់ត្រា

- សារ៖ `data/bright-mind.sqlite`
- ឯកសារដែលផ្ញើ៖ `uploads/`
- Chat ចាប់ផ្តើមពីមិត្តភក្តិ ឬ group របស់អ្នក; public rooms ចាស់ត្រូវបានដកចេញពីការចូលប្រើ។ ប្រវត្តិសារចាស់នៅតែរក្សាទុកក្នុង SQLite។
- ឈ្មោះអ្នកប្រើគ្រាន់តែជាឈ្មោះសម្រាប់បង្ហាញ មិនមែនគណនី login ទេ។ កុំដាក់ server លើ internet សម្រាប់សារឯកជន ឬឯកសារសម្ងាត់ មុនបន្ថែម authentication, HTTPS និងការការពារបន្ថែម។

## មិត្តភក្តិ Group និងហ្គេម

1. ចូលទៅកាន់ **មិត្តភក្តិ** ហើយស្វែងរកតាមឈ្មោះអ្នកប្រើ។ អ្នកទទួលត្រូវទទួល friend request ជាមុនសិន។
2. បន្ទាប់ពីក្លាយជាមិត្ត អ្នកអាចបើក private chat ពីបញ្ជីមិត្តភក្តិ។
3. ចុច **បង្កើត group** រួចដាក់ឈ្មោះ និងជ្រើសមិត្តភក្តិ។ សាររបស់ group ត្រូវបានរក្សាទុកក្នុង database ដូចបន្ទប់ chat ផ្សេងៗ។
4. ក្នុង private chat ចុច **លេង XO** ដើម្បីអញ្ជើញមិត្តលេង Tic-Tac-Toe ជាមួយគ្នា។

## ការហៅ

ក្នុង private chat អ្នកអាចចាប់ផ្តើម voice call ឬ video call។ Call ប្រើ WebRTC ហើយត្រូវអនុញ្ញាត microphone/camera។ Browser បិទ microphone/camera លើ `http://<IP ក្នុង Wi-Fi>`; `localhost` អាចប្រើបានតែលើកុំព្យូទ័រដែលបើក server ប៉ុណ្ណោះ។

### បើក HTTPS សម្រាប់ LAN លើ Windows

1. វាយ `npm run setup:https` ដើម្បីបង្កើត CA សម្រាប់ laptop និង export public certificate។
2. ទុក app ឱ្យបើកជា HTTP សិន។ លើ iPhone ដែលភ្ជាប់ Wi-Fi ដូចគ្នា ទាញយក `http://<IP របស់ laptop>:5173/bright-mind-lan.cer`។ Vite port នេះត្រូវបានប្រើព្រោះបណ្ដាញខ្លះរារាំង port ផ្សេង។
3. ចូល Settings របស់ iPhone ដើម្បី install profile ដែលបានទាញយក; បន្ទាប់មកទៅ **Settings → General → About → Certificate Trust Settings** ហើយបើក full trust សម្រាប់ Bright Mind Chat CA។
4. លើ laptop វាយ `npm run enable:https`, បញ្ឈប់ app ដោយ `Ctrl+C`, រួចបើកម្ដងទៀតដោយ `npm run dev`។ Vite នឹងប្ដូរទៅ HTTPS។ បើក `https://<IP របស់ laptop>:5173` លើទាំងពីរឧបករណ៍ ហើយអនុញ្ញាត microphone/camera។ អ្នកប្រើទាំងអស់ត្រូវ trust CA នេះលើឧបករណ៍របស់ខ្លួន។

IP របស់ laptop អាចប្ដូរពេលប្ដូរ Wi-Fi; បើដូច្នោះ សូមបង្កើត certificate ម្ដងទៀត ហើយប្រើ URL IP ថ្មី។ HTTPS ដោះស្រាយ permission របស់ browser; TURN server អាចនៅតែចាំបាច់សម្រាប់ call ឆ្លងកាត់ network ខ្លះៗនៅពេលប្រើតាម internet។

## Profile និងសុវត្ថិភាព

- បើក **កែ profile** ដើម្បីប្ដូរឈ្មោះ និងរូប PNG, JPG ឬ WebP (អតិបរមា 250 KB)។
- កំណែនេះកំណត់ user ដោយ device ID ក្នុង browser មិនទាន់មាន password/login ឬការផ្ទៀងផ្ទាត់អត្តសញ្ញាណទេ។ ការលុប browser storage អាចធ្វើឱ្យបាត់ ID នោះ។
- កុំបង្ហោះលើ internet ជាមួយទិន្នន័យឯកជន មុនពេលបន្ថែម login/authentication និងការការពារបន្ថែម។ ប្រើ HTTPS លើ internet។
- ទិន្នន័យសារនៅ `data/bright-mind.sqlite`; ឯកសារនៅ `uploads/`។ រក្សាទុក backup ប្រសិនបើចង់រក្សាប្រវត្តិ។
