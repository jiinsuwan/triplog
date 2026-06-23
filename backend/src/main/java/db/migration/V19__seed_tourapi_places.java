package db.migration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.util.HexFormat;

public class V19__seed_tourapi_places extends BaseJavaMigration {

    private static final String PLACE_RESOURCE = "/db/seed/tourapi_places.jsonl";
    private static final String DOCUMENT_RESOURCE = "/db/seed/tourapi_place_documents.jsonl";
    private static final int BATCH_SIZE = 500;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void migrate(Context context) throws Exception {
        seedPlaces(context.getConnection());
        seedDocuments(context.getConnection());
    }

    private void seedPlaces(Connection connection) throws Exception {
        String sql = """
                INSERT INTO places (
                    source, source_id, place_type, name, category, region1, region2,
                    address, road_address, latitude, longitude, phone, summary, description,
                    facilities, homepage, image_url, raw_payload
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    place_type = VALUES(place_type),
                    name = VALUES(name),
                    category = VALUES(category),
                    region1 = VALUES(region1),
                    region2 = VALUES(region2),
                    address = VALUES(address),
                    road_address = VALUES(road_address),
                    latitude = VALUES(latitude),
                    longitude = VALUES(longitude),
                    phone = VALUES(phone),
                    summary = VALUES(summary),
                    description = VALUES(description),
                    facilities = VALUES(facilities),
                    homepage = VALUES(homepage),
                    image_url = VALUES(image_url),
                    raw_payload = VALUES(raw_payload)
                """;

        try (PreparedStatement statement = connection.prepareStatement(sql);
             BufferedReader reader = resourceReader(PLACE_RESOURCE)) {
            int pending = 0;
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) {
                    continue;
                }
                JsonNode place = objectMapper.readTree(line);
                statement.setString(1, text(place, "source"));
                statement.setString(2, text(place, "sourceId"));
                statement.setString(3, text(place, "placeType"));
                statement.setString(4, text(place, "name"));
                statement.setString(5, text(place, "category"));
                statement.setString(6, text(place, "region1"));
                setNullableString(statement, 7, text(place, "region2"));
                setNullableString(statement, 8, text(place, "address"));
                setNullableString(statement, 9, text(place, "roadAddress"));
                statement.setBigDecimal(10, decimal(place, "latitude"));
                statement.setBigDecimal(11, decimal(place, "longitude"));
                setNullableString(statement, 12, text(place, "phone"));
                setNullableString(statement, 13, text(place, "summary"));
                setNullableString(statement, 14, text(place, "description"));
                setNullableString(statement, 15, text(place, "facilities"));
                setNullableString(statement, 16, text(place, "homepage"));
                setNullableString(statement, 17, text(place, "imageUrl"));
                statement.setString(18, json(place.get("rawPayload")));
                statement.addBatch();
                pending++;
                if (pending >= BATCH_SIZE) {
                    statement.executeBatch();
                    pending = 0;
                }
            }
            if (pending > 0) {
                statement.executeBatch();
            }
        }
    }

    private void seedDocuments(Connection connection) throws Exception {
        String sql = """
                INSERT INTO place_documents (
                    place_id, source, source_id, document_type, place_type, title,
                    overview, details_json, document_text, raw_payload, content_hash, fetched_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    place_id = VALUES(place_id),
                    place_type = VALUES(place_type),
                    title = VALUES(title),
                    overview = VALUES(overview),
                    details_json = VALUES(details_json),
                    document_text = VALUES(document_text),
                    raw_payload = VALUES(raw_payload),
                    content_hash = VALUES(content_hash),
                    fetched_at = VALUES(fetched_at)
                """;

        try (PreparedStatement statement = connection.prepareStatement(sql);
             BufferedReader reader = resourceReader(DOCUMENT_RESOURCE)) {
            int pending = 0;
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) {
                    continue;
                }
                JsonNode document = objectMapper.readTree(line);
                String source = text(document, "source");
                String sourceId = text(document, "sourceId");
                String documentText = text(document, "documentText");

                setNullableLong(statement, 1, findPlaceId(connection, source, sourceId));
                statement.setString(2, source);
                statement.setString(3, sourceId);
                statement.setString(4, text(document, "documentType"));
                statement.setString(5, text(document, "placeType"));
                statement.setString(6, text(document, "title"));
                setNullableString(statement, 7, text(document, "overview"));
                setNullableString(statement, 8, json(document.get("details")));
                statement.setString(9, documentText);
                statement.setString(10, json(document.get("rawPayload")));
                statement.setString(11, sha256(documentText));
                setNullableString(statement, 12, text(document, "fetchedAt"));
                statement.addBatch();
                pending++;
                if (pending >= BATCH_SIZE) {
                    statement.executeBatch();
                    pending = 0;
                }
            }
            if (pending > 0) {
                statement.executeBatch();
            }
        }
    }

    private Long findPlaceId(Connection connection, String source, String sourceId) throws SQLException {
        String sql = "SELECT id FROM places WHERE source = ? AND source_id = ? LIMIT 1";
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, source);
            statement.setString(2, sourceId);
            try (ResultSet resultSet = statement.executeQuery()) {
                if (resultSet.next()) {
                    return resultSet.getLong("id");
                }
            }
        }
        return null;
    }

    private BufferedReader resourceReader(String path) {
        InputStream inputStream = V19__seed_tourapi_places.class.getResourceAsStream(path);
        if (inputStream == null) {
            throw new IllegalStateException("Missing seed resource: " + path);
        }
        return new BufferedReader(new InputStreamReader(inputStream, StandardCharsets.UTF_8));
    }

    private String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) {
            return null;
        }
        String text = value.asText();
        return text.isBlank() ? null : text;
    }

    private BigDecimal decimal(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) {
            throw new IllegalStateException("Missing decimal field: " + field);
        }
        return value.decimalValue();
    }

    private String json(JsonNode node) throws IOException {
        if (node == null || node.isNull()) {
            return null;
        }
        return objectMapper.writeValueAsString(node);
    }

    private void setNullableString(PreparedStatement statement, int index, String value) throws SQLException {
        if (value == null) {
            statement.setNull(index, Types.VARCHAR);
            return;
        }
        statement.setString(index, value);
    }

    private void setNullableLong(PreparedStatement statement, int index, Long value) throws SQLException {
        if (value == null) {
            statement.setNull(index, Types.BIGINT);
            return;
        }
        statement.setLong(index, value);
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available", exception);
        }
    }
}
