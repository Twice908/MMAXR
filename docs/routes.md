# Web routes

- `#/` opens the subject menu; `#/subject/<chemistry|physics|biology>` lists its experiences.
- `#/module/<moduleId>` opens an experience. The query string remains available for deep-link parameters.
- Unknown hashes return to the subject menu with a notice; `?module=<moduleId>` remains a direct-open compatibility URL.
- In development, `?gallery` and `?narration-generator` open the developer tools.
