# Bugs

- Setting the default model does not seem like it works.

# Performance (completed)

- [x] Graph performance mode for large graphs (compact nodes/edges + visible-only rendering)
- [x] Render containment on heavy scroll regions (kanban columns, chat history)
- [x] Reduce blur/shadow effects when lists get large
- [x] React Query tuning for heavy datasets (less refetch on focus/reconnect)
- [x] DnD/list rendering optimizations (virtualized kanban + memoized card sections)

# UX

- Consolidate all models to a single place in the settings instead of having AI profiles and all this other stuff
- Simplify the create feature modal. It should just be one page. I don't need nessa tabs and all these nested buttons. It's too complex.
- added to do's list checkbox directly into the card so as it's going through if there's any to do items we can see those update live
- When the feature is done, I want to see a summary of the LLM. That's the first thing I should see when I double click the card.
- I went away to mass edit all my features. For example, when I created a new project, it added auto testing on every single feature card. Now I have to manually go through one by one and change those. Have a way to mass edit those, the configuration of all them.
- Double check and debug if there's memory leaks. It seems like the memory of automaker grows like 3 gigabytes. It's 5gb right now and I'm running three different cursor cli features implementing at the same time.
- Typing in the text area of the plan mode was super laggy.
- When I have a bunch of features running at the same time, it seems like I cannot edit the features in the backlog. Like they don't persist their file changes and I think this is because of the secure FS file has an internal queue to prevent hitting that file open write limit. We may have to reconsider refactoring away from file system and do Postgres or SQLite or something.
- modals are not scrollable if height of the screen is small enough
- and the Agent Runner add an archival button for the new sessions.
- investigate a potential issue with the feature cards not refreshing. I see a lock icon on the feature card But it doesn't go away until I open the card and edit it and I turn the testing mode off. I think there's like a refresh sync issue.
