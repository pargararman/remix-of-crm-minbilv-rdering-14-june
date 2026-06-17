// Modeller per märke (Blocket-vänlig lista, ej uttömmande).
// Används av ModelCombobox för att begränsa modellvalet till valt märke.
// Okänt märke → ingen lista (fritt textfält).

export const BRAND_MODELS: Record<string, string[]> = {
  Audi: ["A1","A2","A3","A4","A5","A6","A7","A8","Q2","Q3","Q4 e-tron","Q5","Q7","Q8","e-tron","e-tron GT","RS3","RS4","RS5","RS6","RS7","S3","S4","S5","S6","TT"],
  BMW: ["1-serie","2-serie","3-serie","4-serie","5-serie","6-serie","7-serie","8-serie","X1","X2","X3","X4","X5","X6","X7","Z3","Z4","i3","i4","i5","i7","iX","iX1","iX3","M2","M3","M4","M5","M8"],
  "Mercedes-Benz": ["A-klass","B-klass","C-klass","CLA","CLS","E-klass","S-klass","G-klass","GLA","GLB","GLC","GLE","GLS","SL","SLC","V-klass","Vito","EQA","EQB","EQC","EQE","EQS","AMG GT"],
  Volkswagen: ["Polo","Golf","Golf Variant","Passat","Passat Variant","Arteon","up!","T-Cross","T-Roc","Tiguan","Touareg","Touran","Sharan","Caddy","Multivan","Transporter","ID.3","ID.4","ID.5","ID.7","ID. Buzz","Beetle","Scirocco","Caravelle"],
  Volvo: ["240","740","850","940","960","C30","C40","C70","S40","S60","S70","S80","S90","V40","V50","V60","V70","V90","XC40","XC60","XC70","XC90","EX30","EX90"],
  Toyota: ["Aygo","Yaris","Yaris Cross","Corolla","Corolla Cross","Camry","Avensis","C-HR","RAV4","Highlander","Land Cruiser","Hilux","Prius","Auris","Verso","bZ4X","Mirai","GR86","GR Yaris","GR Supra","Proace","Proace City"],
  Ford: ["Fiesta","Focus","Mondeo","Galaxy","S-Max","Kuga","EcoSport","Puma","Explorer","Edge","Mustang","Mustang Mach-E","Ranger","Transit","Transit Custom","Tourneo","Bronco","B-Max","C-Max","Ka"],
  Kia: ["Picanto","Rio","Ceed","ProCeed","XCeed","Stonic","Soul","Niro","Sportage","Sorento","EV6","EV9","Optima","Stinger","Carens","Carnival","e-Niro","e-Soul"],
  Hyundai: ["i10","i20","i30","i40","Bayon","Kona","Tucson","Santa Fe","Ioniq","Ioniq 5","Ioniq 6","Nexo","Staria","H-1","Veloster"],
  Mazda: ["Mazda2","Mazda3","Mazda5","Mazda6","CX-3","CX-30","CX-5","CX-60","CX-9","MX-5","MX-30","BT-50"],
  Nissan: ["Micra","Note","Pulsar","Almera","Leaf","Juke","Qashqai","X-Trail","Murano","Pathfinder","Navara","NV200","NV300","Townstar","Ariya","350Z","370Z","GT-R"],
  Opel: ["Adam","Corsa","Astra","Insignia","Mokka","Crossland","Grandland","Zafira","Combo","Vivaro","Movano","Ampera"],
  Peugeot: ["108","208","2008","308","3008","408","508","5008","Partner","Rifter","Traveller","Expert","Boxer","e-208","e-2008","e-308"],
  Renault: ["Twingo","Clio","Captur","Mégane","Mégane E-Tech","Scénic","Kadjar","Arkana","Espace","Talisman","Koleos","Kangoo","Trafic","Master","Zoe","Twizy","Austral"],
  Citroen: ["C1","C3","C3 Aircross","C4","C4 Cactus","C4 Picasso","C4 Spacetourer","C5","C5 Aircross","C5 X","Berlingo","Jumpy","Jumper","DS3","DS4","DS5","ë-C4"],
  Seat: ["Ibiza","Leon","Toledo","Ateca","Arona","Tarraco","Alhambra","Mii","Cordoba","Altea"],
  Skoda: ["Citigo","Fabia","Rapid","Scala","Octavia","Superb","Karoq","Kodiaq","Kamiq","Enyaq","Yeti","Roomster"],
  Subaru: ["Impreza","Legacy","Outback","Forester","XV","Crosstrek","BRZ","WRX","Solterra","Ascent"],
  Porsche: ["911","718","Boxster","Cayman","Macan","Cayenne","Panamera","Taycan"],
  Chevrolet: ["Aveo","Cruze","Captiva","Camaro","Corvette","Spark","Trax","Volt"],
  "Alfa Romeo": ["MiTo","Giulietta","Giulia","Stelvio","Tonale","Brera","159","156","147"],
  "Aston Martin": ["DB9","DB11","DB12","Vantage","DBS","DBX","Rapide"],
  Bentley: ["Continental","Flying Spur","Bentayga","Mulsanne"],
  Cadillac: ["ATS","CTS","XT4","XT5","Escalade"],
  Chrysler: ["300C","Voyager","Grand Voyager","Pacifica","PT Cruiser"],
  Dacia: ["Sandero","Logan","Duster","Dokker","Lodgy","Jogger","Spring"],
  Daewoo: ["Matiz","Lanos","Nubira","Kalos"],
  DS: ["DS 3","DS 4","DS 5","DS 7","DS 9"],
  Ferrari: ["F8","296","SF90","Roma","Portofino","812","Purosangue"],
  Fiat: ["500","500X","500L","Panda","Punto","Tipo","Doblo","Ducato","124 Spider","Multipla"],
  Honda: ["Jazz","Civic","Accord","CR-V","HR-V","ZR-V","e","NSX","Insight","Stream"],
  Jaguar: ["XE","XF","XJ","F-Pace","E-Pace","I-Pace","F-Type"],
  Jeep: ["Renegade","Compass","Cherokee","Grand Cherokee","Wrangler","Gladiator","Avenger"],
  Lamborghini: ["Huracán","Aventador","Urus","Revuelto"],
  Lancia: ["Ypsilon","Delta","Musa","Thema"],
  "Land Rover": ["Defender","Discovery","Discovery Sport","Range Rover","Range Rover Sport","Range Rover Evoque","Range Rover Velar","Freelander"],
  Lexus: ["IS","ES","LS","CT","UX","NX","RX","RZ","LX","LC","RC"],
  Lotus: ["Elise","Exige","Evora","Emira","Eletre"],
  Maserati: ["Ghibli","Quattroporte","Levante","Grecale","MC20","GranTurismo"],
  Maybach: ["S-klass","GLS"],
  MG: ["MG4","MG5","ZS","HS","Marvel R","Cyberster"],
  Mini: ["Cooper","One","Clubman","Countryman","Cabriolet","Paceman","Roadster"],
  Mitsubishi: ["Space Star","ASX","Eclipse Cross","Outlander","Outlander PHEV","L200","Pajero","Lancer","Colt"],
  Polestar: ["1","2","3","4"],
  "Rolls-Royce": ["Phantom","Ghost","Wraith","Dawn","Cullinan","Spectre"],
  Rover: ["25","45","75","Streetwise"],
  Saab: ["9-3","9-5","9-7X","900","9000"],
  Smart: ["fortwo","forfour","#1","#3"],
  SsangYong: ["Tivoli","Korando","Rexton","Musso","Rodius"],
  Suzuki: ["Swift","Ignis","Baleno","S-Cross","Vitara","Jimny","SX4","Across"],
  Tesla: ["Model 3","Model S","Model X","Model Y","Cybertruck","Roadster"],
};

export function modelsFor(brand: string | null | undefined): string[] {
  if (!brand) return [];
  const key = Object.keys(BRAND_MODELS).find(
    (b) => b.toLowerCase() === brand.trim().toLowerCase(),
  );
  return key ? BRAND_MODELS[key] : [];
}
