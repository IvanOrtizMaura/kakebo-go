import { FirebaseOptions } from 'firebase/app';
import { environment } from '../../../environments/environment';

export const firebaseConfig: FirebaseOptions = environment.firebase;
