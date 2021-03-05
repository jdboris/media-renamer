const URL = "http://api.themoviedb.org/3/";
const API_KEY = "4c9dfe2e307921df9eff4afb2e830390";

let query = "Spongebob Squarepants";

let completeAddress = `${URL}search/tv?api_key=${API_KEY}&include_adult=true&query=${encodeURIComponent(
  query
)}`;

fetch(completeAddress, {
  method: "GET",
})
  .then((response) => {
    return response.json();
  })
  .then((data) => {
    if (data.results.length == 0) {
      console.error("No TV series results found returned from API.");
    } else {
      console.log(data.results[0].id);
    }
  });
