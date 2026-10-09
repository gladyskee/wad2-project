const API_KEY = 'YOUR_OPENWEATHER_API_KEY' // Replace with your key or use a backend proxy

export async function fetchWeatherForecast(city = 'Seoul') {
  try {
    const response = await fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${city}&units=metric&appid=${API_KEY}`)
    if (!response.ok) throw new Error('Failed to fetch OpenWeatherMap data')
    
    const data = await response.json()
    
    // Map OpenWeatherMap list items into a simplified format for today's hours
    return data.list.slice(0, 8).map(item => {
      const hour = new Date(item.dt * 1000).getHours()
      const condition = item.weather[0].main // e.g., "Rain", "Clear", "Clouds"
      return {
        time: hour,
        condition: condition,
        rain: condition.toLowerCase().includes('rain')
      }
    })
  } catch (err) {
    console.warn('Using fallback weather mock due to network/API key error:', err)
    
    // Clean fallback matching your reviewer's suggested schema
    return [
      { time: 12, condition: 'Clear', rain: false },
      { time: 13, condition: 'Clouds', rain: false },
      { time: 14, condition: 'Rain', rain: true },
      { time: 15, condition: 'Rain', rain: true },
      { time: 16, condition: 'Clouds', rain: false }
    ]
  }
}