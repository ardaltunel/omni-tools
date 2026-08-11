const weatherPanel = document.getElementById('weather-app');
const container = weatherPanel.querySelector('.weather-app');
const search = weatherPanel.querySelector('.search-box button');
const currentLocationButton = weatherPanel.querySelector('.location-button');
const searchInput = weatherPanel.querySelector('.search-box input');
const weatherBox = weatherPanel.querySelector('.weather-box');
const weatherDetails = weatherPanel.querySelector('.weather-details');
const error404 = weatherPanel.querySelector('.not-found');
const statusMessage = weatherPanel.querySelector('.status-message');
let weatherInitialized = false;

const APIKey = 'ae478550c05405047fe1265293b32522';

const weatherImages = {
    Clear: 'tools/weather-app/images/clear.png',
    Rain: 'tools/weather-app/images/rain.png',
    Drizzle: 'tools/weather-app/images/rain.png',
    Thunderstorm: 'tools/weather-app/images/rain.png',
    Snow: 'tools/weather-app/images/snow.png',
    Clouds: 'tools/weather-app/images/cloud.svg',
    Mist: 'tools/weather-app/images/mist.png',
    Smoke: 'tools/weather-app/images/mist.png',
    Haze: 'tools/weather-app/images/mist.png',
    Dust: 'tools/weather-app/images/mist.png',
    Fog: 'tools/weather-app/images/mist.png',
    Sand: 'tools/weather-app/images/mist.png',
    Ash: 'tools/weather-app/images/mist.png',
    Squall: 'tools/weather-app/images/mist.png',
    Tornado: 'tools/weather-app/images/mist.png'
};

const setStatus = (message = '', isError = false) => {
    statusMessage.textContent = message;
    statusMessage.classList.toggle('error', isError);
};

const setLoading = (isLoading) => {
    container.classList.toggle('is-loading', isLoading);
    search.disabled = isLoading;
    currentLocationButton.disabled = isLoading;
};

const showError = (message) => {
    weatherBox.classList.remove('fadeIn');
    weatherDetails.classList.remove('fadeIn');
    container.classList.remove('has-weather');
    weatherBox.style.display = 'none';
    weatherDetails.style.display = 'none';
    error404.style.display = 'block';
    error404.classList.add('fadeIn');
    setStatus(message, true);
};

const getDisplayLocation = (weather, geoLocation) => {
    const name = geoLocation && geoLocation.name ? geoLocation.name : weather.name;
    const country = geoLocation && geoLocation.country ? geoLocation.country : weather.sys.country;
    const state = geoLocation && geoLocation.state && geoLocation.state !== name ? `, ${geoLocation.state}` : '';

    return `${name}${state}${country ? `, ${country}` : ''}`;
};

const showWeather = (json, geoLocation) => {
    if (String(json.cod) !== '200') {
        showError('Lütfen geçerli bir şehir veya bölge yazın.');
        return;
    }

    error404.style.display = 'none';
    error404.classList.remove('fadeIn');
    setStatus();

    const image = weatherPanel.querySelector('.weather-box img');
    const locationName = weatherPanel.querySelector('.weather-box .location-name');
    const temperature = weatherPanel.querySelector('.weather-box .temperature');
    const description = weatherPanel.querySelector('.weather-box .description');
    const feelsLike = weatherPanel.querySelector('.weather-details .feels-like span');
    const humidity = weatherPanel.querySelector('.weather-details .humidity span');
    const wind = weatherPanel.querySelector('.weather-details .wind span');
    const weatherMain = json.weather[0].main;

    image.src = weatherImages[weatherMain] || 'tools/weather-app/images/cloud.svg';
    image.alt = json.weather[0].description;
    locationName.textContent = getDisplayLocation(json, geoLocation);
    temperature.innerHTML = `${Math.round(json.main.temp)}<span>&deg;C</span>`;
    description.textContent = json.weather[0].description;
    feelsLike.textContent = `${Math.round(json.main.feels_like)}\u00B0C`;
    humidity.textContent = `${json.main.humidity}%`;
    wind.textContent = `${Math.round(json.wind.speed * 3.6)} km/sa`;

    weatherBox.style.display = 'block';
    weatherDetails.style.display = 'grid';
    weatherBox.classList.add('fadeIn');
    weatherDetails.classList.add('fadeIn');
    container.classList.add('has-weather');
};

const fetchWeather = async (url, geoUrl = null) => {
    setLoading(true);
    setStatus('Hava durumu alınıyor...');

    try {
        const [weatherResponse, geoResponse] = await Promise.all([
            fetch(url),
            geoUrl ? fetch(geoUrl) : Promise.resolve(null)
        ]);
        const json = await weatherResponse.json();
        const geoJson = geoResponse ? await geoResponse.json() : null;
        const geoLocation = Array.isArray(geoJson) && geoJson.length ? geoJson[0] : null;

        showWeather(json, geoLocation);
    } catch (error) {
        showError('Bağlantı kurulamadı. Birazdan tekrar deneyin.');
    } finally {
        setLoading(false);
    }
};

const searchByCity = () => {
    const city = searchInput.value.trim();

    if (!city) {
        setStatus('Bir şehir adı yazabilir veya konum butonunu kullanabilirsiniz.', true);
        searchInput.focus();
        return;
    }

    fetchWeather(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&lang=tr&appid=${APIKey}`);
};

const searchByCoordinates = (latitude, longitude) => {
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&lang=tr&appid=${APIKey}`;
    const geoUrl = `https://api.openweathermap.org/geo/1.0/reverse?lat=${latitude}&lon=${longitude}&limit=1&appid=${APIKey}`;

    fetchWeather(weatherUrl, geoUrl);
};

const searchByIpLocation = async () => {
    setLoading(true);
    setStatus('Konum alınıyor...');

    try {
        const response = await fetch('https://ipwho.is/?fields=success,message,city,region,country_code,latitude,longitude');
        const location = await response.json();

        if (!location.success || !location.latitude || !location.longitude) {
            throw new Error(location.message || 'Konum bulunamadı');
        }

        const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${location.latitude}&lon=${location.longitude}&units=metric&lang=tr&appid=${APIKey}`;
        const geoLocation = {
            name: location.city,
            state: location.region,
            country: location.country_code
        };
        const weatherResponse = await fetch(weatherUrl);
        const weather = await weatherResponse.json();

        showWeather(weather, geoLocation);
    } catch (error) {
        setStatus('Konum alınamadı. Konum adıyla arama yapabilirsiniz.', true);
    } finally {
        setLoading(false);
    }
};

const searchByBrowserLocation = () => {
    if (!navigator.geolocation) {
        searchByIpLocation();
        return;
    }

    setLoading(true);
    setStatus('Konum izni bekleniyor...');

    navigator.geolocation.getCurrentPosition(
        ({ coords }) => searchByCoordinates(coords.latitude, coords.longitude),
        () => {
            setLoading(false);
            searchByIpLocation();
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
};

const useCurrentLocation = () => {
    searchByBrowserLocation();
};

search.addEventListener('click', searchByCity);
currentLocationButton.addEventListener('click', useCurrentLocation);
searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        searchByCity();
    }
});

const initWeatherApp = () => {
    if (weatherInitialized) return;
    weatherInitialized = true;
    localStorage.removeItem('lastWeatherLocation');
    searchInput.value = '';
    searchByBrowserLocation();
};

document.addEventListener('tool-activated', (event) => {
    if (event.detail?.tool === 'weather-app') {
        initWeatherApp();
    }
});
