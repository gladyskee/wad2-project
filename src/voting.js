// The group's majority vote on saved places (used by the browser and the server).
// On a group trip (2+ travellers) a saved place goes on a day once more than half want to go.
// Only votes from people still on the trip count.

// More than half the group: 2 of 3, 3 of 4, 3 of 5...
export function votesNeeded(travellers) {
  return Math.floor(travellers.length / 2) + 1
}

// The yes votes that count (someone removed from the trip no longer does)
export function yesVotes(place, travellers) {
  return (place.votes || []).filter((v) => travellers.includes(v))
}

// Can this place go on a day? Solo trips skip voting.
export function isGroupPick(place, travellers) {
  return travellers.length < 2 || yesVotes(place, travellers).length >= votesNeeded(travellers)
}
