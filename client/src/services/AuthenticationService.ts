import Api from "./Api";

export type Credentials = {
  email: string;
  password: string;
 
};

export default {
    register(credentials:Credentials){
        return Api().post('register',credentials)
    }
}



