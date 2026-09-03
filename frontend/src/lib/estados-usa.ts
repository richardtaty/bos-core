/**
 * Copia de la lista de estados para el frontend.
 *
 * LA FUENTE DE VERDAD ES `backend/src/lib/estados-usa.ts`. Son paquetes npm separados y no
 * comparten carpeta, así que hay dos copias a propósito. Si agregas o cambias un valor,
 * cámbialo en los dos archivos — el backend rechaza con error 400 cualquier estado que no
 * esté en su lista, así que una copia desincronizada se nota al guardar.
 */
export const ESTADOS_USA = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware",
  "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
  "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
  "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico",
  "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania",
  "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
  "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming", "Washington D.C.",
  // Puerto Rico es territorio de EE.UU., no país extranjero: un cliente de allá no debe
  // contarse como internacional en los reportes.
  "Puerto Rico",
  "Fuera de USA",
];

/**
 * Sugerencias para el campo ciudad. No es una lista cerrada — el cliente puede vivir en
 * cualquier parte. Sirve para empujar hacia una escritura consistente ("Miami", no "miami"
 * ni "MIAMI"), que es justo el problema que dejó la base llena de variantes.
 */
export const CIUDADES_SUGERIDAS = [
  "Miami", "Orlando", "Tampa", "Jacksonville", "Fort Lauderdale", "West Palm Beach", "Hialeah",
  "Atlanta", "Charlotte", "Raleigh", "Greenville", "Columbia", "Nashville", "Memphis",
  "Houston", "Dallas", "San Antonio", "Austin", "El Paso", "Fort Worth",
  "New York", "Brooklyn", "Bronx", "Queens", "Newark", "Jersey City",
  "Los Angeles", "San Diego", "San Francisco", "Sacramento", "San Jose", "Fresno",
  "Chicago", "Phoenix", "Philadelphia", "Boston", "Washington", "Denver", "Las Vegas",
  "Seattle", "Portland", "Detroit", "Minneapolis", "Baltimore", "Milwaukee", "Albuquerque",
  "Tucson", "Kansas City", "Mesa", "Omaha", "Colorado Springs", "Long Beach", "Virginia Beach",
  "Oakland", "Tulsa", "Arlington", "New Orleans", "Wichita", "Cleveland", "Bakersfield",
  "Aurora", "Anaheim", "Honolulu", "Santa Ana", "Riverside", "Corpus Christi", "Lexington",
  "Stockton", "St. Louis", "Saint Paul", "Cincinnati", "Pittsburgh", "Greensboro", "Anchorage",
  "Plano", "Lincoln", "Chula Vista", "Irvine", "Fort Wayne",
  "Durham", "St. Petersburg", "Laredo", "Buffalo", "Madison", "Chandler", "Lubbock",
  "Winston-Salem", "Scottsdale", "Reno", "Gilbert", "Norfolk", "Glendale", "North Las Vegas",
  "Irving", "Chesapeake", "Baton Rouge", "Fremont", "Boise", "Richmond", "San Bernardino",
];
