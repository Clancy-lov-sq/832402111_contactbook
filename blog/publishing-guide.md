# Publishing and Submission Checklist

This file is not the blog post itself but the **operating manual for submitting the assignment**: push the repository to GitHub, check the links, publish the post on CSDN and hand the work in. Every command can be copied and run as it is.

## 1. Push the repository to GitHub

Create a new **Public** repository on GitHub named `832402111_contactbook` (do not add README, .gitignore or License — the local repository already has them).

```bash
cd 832402111_contactbook

# check the author and the commit history
git log --oneline

# attach the remote repository and push
git remote add origin https://github.com/Clancy-lov-sq/832402111_contactbook.git
git push -u origin main
```

After pushing, open <https://github.com/Clancy-lov-sq/832402111_contactbook> and confirm that:

- [ ] the repository is Public and can be opened anonymously;
- [ ] the home page shows the README;
- [ ] the Commits page has at least 3 commits, all authored by me;
- [ ] `codestyle.md`, `docs/API.md`, `docs/DESIGN.md` and `deploy/README.md` all open;
- [ ] the images under `screenshots/` preview on the web page.

## 2. Check the links in the blog post

`blog/assignment-blog.md` contains 8 external links. Open each one before publishing and make sure it is not a 404 (use the table below as the checklist):

| Link | Should point to |
| --- | --- |
| `https://github.com/Clancy-lov-sq/832402111_contactbook` | Repository home |
| `.../blob/main/codestyle.md` | Code standard |
| `.../blob/main/README.md` | Install and API notes |
| `.../blob/main/docs/API.md` | API documentation |
| `.../blob/main/docs/DESIGN.md` | Design document |
| `.../blob/main/deploy/README.md` | Deployment guide |
| `.../blob/main/docs/samples/contactbook-export-sample.xlsx` | Sample export file |
| `.../blob/main/screenshots/capture-results.json` | The 28 assertions from the capture script |

If the GitHub account or the repository name is different, do a global find-and-replace of `Clancy-lov-sq/832402111_contactbook`.

## 3. Generate the commit-history screenshot (optional, already referenced)

The blog references `blog/images/commits.png`. From the repository root, run:

```bash
git log --pretty=format:'%h|%ad|%an|%s' --date=format:'%Y-%m-%d %H:%M' > docs/git-history.txt
python tools/render-commits.py
cp screenshots/commits.png blog/images/commits.png
```

The script reads real `git log` output, so the hashes, dates, authors and messages in the image match the repository. After re-rendering, remember to commit:

```bash
git add docs/git-history.txt screenshots/commits.png blog/images/commits.png
git commit -m "docs(blog): refresh the commit history screenshot"
git push
```

## 4. Publish on CSDN

1. Open <https://blog.csdn.net>, go to "Creator Center → Write an article" and switch to the **Markdown** editor.
2. Paste in the whole of `blog/assignment-blog.md` (leave out the code-fence markers at the top of the file).
3. **Insert the images**: CSDN does not allow local relative paths. Drag the files from `blog/images/` into the matching places one by one, or upload them to the photo album first and then replace the links. The mapping between images and sections:

   | Image | Position |
   | --- | --- |
   | `01-home.png` | 3.1 Main screen |
   | `02-favorites.png`, `05-bookmark-toast.png`, `16-favorites-final.png` | 3.2 Favorites |
   | `03-search.png`, `04-group.png` | 3.3 Search and group filters |
   | `06-detail.png` | 3.4 Detail drawer |
   | `07-new-contact-form.png`, `08-form-validation.png`, `09-created-toast.png` | 3.5 Creation and validation |
   | `11-import-pick.png`, `12-import-report.png` | 3.6 Import |
   | `10-export-menu.png`, `17-export-workbook.png` | 3.7 Export |
   | `14-empty-state.png`, `15-mobile.png` | 3.8 Empty states and mobile |
   | `demo-running.gif` | 3.9 Full running demo |
   | `commits.png` | Section 8, Git history |

4. Suggested title: `Extreme Programming Assignment: ContactBook (Favorites / Multiple Contact Methods / Excel Import and Export)`.
5. Suggested tags: `software engineering`, `extreme programming`, `Vue`, `Node.js`, `SQLite`, `Excel`.
6. Suggested category: `Software Engineering (FZU-MU)`, matching the course community (`2601_FZU-MU_SE`).
7. Click **Publish** (do not just save a draft). The assignment thread notes that posts go through review, so leave at least 1–2 hours before the deadline.
8. Go back to the assignment thread <https://bbs.csdn.net/topics/620593436>, click "Submit task" and paste the blog URL.

## 5. Video (if the instructor requires an MP4)

The blog embeds a 15-frame animated GIF that covers the main flow from start to finish. If an MP4 is also required:

1. Open <http://127.0.0.1:8080> (run `npm start` first);
2. press `Win + G` to open the Windows Game Bar recorder and record 1–2 minutes following the order of operations in section 3.9 of the blog;
3. upload it to Bilibili or Tencent Cloud and add the link at the end of the "3.9 Full running demo" subsection;
4. no editing is needed — what matters is that the recording is complete and the operations are legible.

## 6. Pre-submission self-check (against the grading sheet)

- [ ] Repository is Public with at least 3 commits (this project has 14, 100% from one contributor);
- [ ] the blog covers: repository address, commit-history screenshot and commit count, implementation notes, screenshots and demo, division of work (an individual project, already stated) and the PSP table;
- [ ] the bookmark feature can be demonstrated: star → refresh → still in Favorites;
- [ ] multiple contact methods: create a contact with at least 3 methods of different types;
- [ ] export: the downloaded xlsx has one row per contact and one column per kind of information;
- [ ] import: import the exported file back and the report says "updated", not "failed";
- [ ] deployment: if a cloud server was rented, follow `deploy/README.md` and add the public URL to the blog table; if not, keep the "not deployed" note and never write a fake address;
- [ ] the blog is published and has passed review, and the assignment thread has been submitted.

## 7. FAQ

**Q: `npm ci` fails with an engine error?**
Node.js ≥ 22.5 is required (`node:sqlite` ships from 22.5). Check with `node --version` and retry after upgrading.

**Q: Port 8080 is already in use?**
`PORT=3000 npm start` (PowerShell: `$env:PORT=3000; npm start`).

**Q: The page is blank?**
Run `npm run build` first; when `server/public` does not exist, Express serves the API only.

**Q: The import complains that the sheet has no name column?**
The header row must contain a Name column (`Name` or `Full name`); a title row above it is fine, but the name column cannot be renamed to something unrecognized such as "Contact name (required)".

**Q: CSDN shows broken images?**
Local relative paths stop working once uploaded, so you must use the image URLs from the CSDN album. Drag the images in again.
