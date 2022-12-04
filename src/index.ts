import {Hono} from "hono";

interface Env {
    USER_KV: KVNamespace;
    UUID_KV: KVNamespace;
}

interface Name {
    name: string;
    id: string;
}

interface SkinResponse {
    id: string;
    name: string;
    properties: SkinProperties[];
}


interface SkinProperties {
    name: string;
    value: any;
}


const jsonHeader = {
    "Content-Type": "Application/Json",
};
const app = new Hono<{ Bindings: Env }>({strict: false});
const user = new Hono<{ Bindings: Env }>({strict: false});

function validate(username: string) {
    return (username.length === 32 || username.length === 36);

}

// https://wiki.vg/Mojang_API#Username_to_UUID
user.get("/:username", async (context) => {
    const username = context.req.param('username');
    const UUID_KV = context.env.UUID_KV;
    const USER_KV = context.env.USER_KV;

    let uuid: string | null;
    if (validate(username)) {
        uuid = parseUUID(username.replaceAll("-", ""));
    } else {
        uuid = await UUID_KV.get(username)
        if (uuid === null) {
            const uuidResponse = await fetch("https://api.mojang.com/users/profiles/minecraft/" + username);
            if (uuidResponse.ok) {
                const data: Name = await uuidResponse.json();
                uuid = data.id;
                await UUID_KV.put(username, uuid, {expirationTtl: 60 * 60 * 24});
            } else {
                return uuidResponse
            }
        }
    }
    let data = await USER_KV.get<SkinResponse>(uuid);
    if (data === null) {
        const textureDataResponse = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`);
        if (textureDataResponse.ok) {
            const texture = await textureDataResponse.json<SkinResponse>()
            if (texture !== null) {
                const properties = texture.properties[0].value;
                data = {
                    id: texture.id,
                    name: texture.name,
                    properties: [
                        {
                            name: "textures",
                            value: JSON.parse(atob(properties)),
                        }
                    ]
                }
                await USER_KV.put(uuid, JSON.stringify(data), {expirationTtl: 60 * 60 * 24});
            }
        } else {
            return textureDataResponse;
        }
    }


    if (data !== null) {
        return new Response(JSON.stringify(data), {
            headers: jsonHeader,
            status: 200
        });
    } else {
        return new Response("Error", {
            headers: jsonHeader,
            status: 500
        });
    }
});

app.route("/user", user);

function parseUUID(uuid: string) {
    return uuid.replace(/(\w{8})(\w{4})(\w{4})(\w{4})(\w{12})/, "$1-$2-$3-$4-$5");
}


export default app;
