const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

exports.processUserProgress = functions.firestore
  .document('users/{uid}')
  .onWrite(async (change, context) => {
    try{
      const uid = context.params.uid;
      const after = change.after.exists ? change.after.data() : null;
      if(!after) return null;

      const progress = after.progress || after;
      const modules = ['physics','chemistry','comp','math','language'];
      let completed = 0;
      const details = {};
      for(const m of modules){
        const d = progress[m];
        if(d && d.last) { completed++; details[m] = { last: d.last, present: true } }
        else if(d){ details[m] = { last: d, present: true } }
        else { details[m] = { present: false } }
      }
      const summary = {
        modulesCompleted: completed,
        details,
        processedAt: Date.now()
      };

      const userRef = db.doc(`users/${uid}`);
      await userRef.set({ summary }, { merge: true });
      console.log(`Processed progress for ${uid}`, summary);
      return null;
    }catch(err){ console.error('processUserProgress error', err); return null; }

  });
