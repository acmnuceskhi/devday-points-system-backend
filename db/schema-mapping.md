# Schema Mapping (Portal V1)

This service reads from existing shared tables only.

## Auth and Profile
- `User`: login identity (`email`, `password`, `isActive`, `type`)
- `Participant`: participant profile joined by `Participant.userId = User.id`
- `UserAction`: audit logging for login attempts (`action = LOGIN` when enum supports it)

## Competitions and Venues
- `Competition`: competition catalog
- `_CompetitionToVenue`: competition-to-venue mapping
- `Venue`: venue details
- `Team`: team registration records and payment status
- `TeamMember`: participant membership in teams

## Endpoints to Tables
- `POST /api/v1/auth/login` -> `User`, `Participant`, `UserAction`
- `GET /api/v1/participants/me` -> `Participant`
- `GET /api/v1/participants/me/competitions` -> `TeamMember`, `Team`, `Competition`, `_CompetitionToVenue`, `Venue`
- `GET /api/v1/competitions` -> `Competition`, `Team`
- `GET /api/v1/competitions/:id` -> `Competition`, `Team`, `_CompetitionToVenue`, `Venue`
- `GET /api/v1/competitions/:id/venues` -> `_CompetitionToVenue`, `Venue`
- `GET /api/v1/teams/:id` -> `Team`, `TeamMember`, `Participant`, `Competition`
- `GET /api/v1/participants/rankings` -> `Participant`, `TeamMember`, `Team`
